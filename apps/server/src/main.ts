import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Logger, NotFoundException, ValidationPipe } from '@nestjs/common';
import { Logger as PinoLogger } from 'nestjs-pino';
import { TransformHttpResponseInterceptor } from './common/interceptors/http-response.interceptor';
import { WsRedisIoAdapter } from './ws/adapter/ws-redis.adapter';
import fastifyMultipart from '@fastify/multipart';
import fastifyCookie from '@fastify/cookie';
import fastifyCompress from '@fastify/compress';
import fastifyIp from 'fastify-ip';
import { InternalLogFilter } from './common/logger/internal-log-filter';
import { EnvironmentService } from './integrations/environment/environment.service';
import { resolveFrameHeader } from './common/helpers';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      trustProxy: true,
      routerOptions: {
        maxParamLength: 1000,
        ignoreTrailingSlash: true,
        ignoreDuplicateSlashes: true,
      },
      // NestJS's setGlobalPrefix `exclude` list matches by route *shape*, not by
      // controller: a bare param pattern like ':slug' would also un-prefix any
      // other single-segment route in the app (e.g. HealthController's '/health').
      // So custom-domain blog requests (host != primary) are rewritten here, before
      // Fastify's router runs, onto uniquely-named '__blog-*' sentinel paths that
      // only BlogRenderController registers — that keeps the exclude patterns for
      // those routes literal-prefixed and safe to match structurally.
      rewriteUrl(req) {
        const host = (req.headers.host ?? '')
          .toString()
          .toLowerCase()
          .replace(/:\d+$/, '');
        const primaryHost = new URL(
          process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`,
        ).hostname.toLowerCase();
        if (!host || host === primaryHost) return req.url;

        // In cloud mode, the bare SUBDOMAIN_HOST and every tenant subdomain
        // under it (docs/specs/done/MULTI_TENANCY_SPEC.md) are legitimate first-party
        // hosts, not blog custom domains — only a host outside that whole
        // family should hit the blog-domain rewrite below.
        const subdomainHost = (process.env.SUBDOMAIN_HOST || '').toLowerCase();
        if (
          process.env.CLOUD === 'true' &&
          subdomainHost &&
          (host === subdomainHost || host.endsWith(`.${subdomainHost}`))
        ) {
          return req.url;
        }

        const [pathOnly, query] = req.url.split('?');
        const suffix = query ? `?${query}` : '';
        const segments = pathOnly.split('/').filter(Boolean);
        const seoFile = (s: string) =>
          s === 'sitemap.xml' || s === 'rss.xml' || s === 'robots.txt';

        if (segments.length === 0) return `/__blog-root${suffix}`;
        if (segments.length === 1 && !seoFile(segments[0])) {
          return `/__blog-segment/${segments[0]}${suffix}`;
        }
        if (segments.length === 2 && !seoFile(segments[1])) {
          return `/__blog-pair/${segments[0]}/${segments[1]}${suffix}`;
        }
        return req.url;
      },
    }),
    {
      rawBody: true,
      // captures NestJS internal errors
      logger: new InternalLogFilter(),
      // bufferLogs must be false else pino will fail
      // to log OnApplicationBootstrap logs
      bufferLogs: false,
    },
  );

  app.useLogger(app.get(PinoLogger));

  app.setGlobalPrefix('api', {
    exclude: [
      'robots.txt',
      'sitemap.xml',
      'rss.xml',
      'share/:shareId/p/:pageSlug',
      'blog',
      'blog/:slug',
      'blog/sitemap.xml',
      'blog/rss.xml',
      'blog/robots.txt',
      ':basePath/sitemap.xml',
      ':basePath/rss.xml',
      ':basePath/robots.txt',
      '__blog-root',
      '__blog-segment/:segment',
      '__blog-pair/:basePath/:slug',
      'mcp',
    ],
  });

  const reflector = app.get(Reflector);
  const redisIoAdapter = new WsRedisIoAdapter(app);
  await redisIoAdapter.connectToRedis();

  app.useWebSocketAdapter(redisIoAdapter);

  await app.register(fastifyCompress, { global: true });
  await app.register(fastifyIp);
  await app.register(fastifyMultipart);
  await app.register(fastifyCookie);

  const environmentService = app.get(EnvironmentService);
  const frameHeader = resolveFrameHeader(
    environmentService.isIframeEmbedAllowed(),
    environmentService.getIframeAllowedOrigins(),
  );
  if (frameHeader) {
    // Skipped routes:
    //   /api/files/ - attachment controller sets its own CSP we'd overwrite
    //   /share/     0 public share pages are safe to embed
    const frameHeaderSkippedPrefixes = ['/api/files/', '/share/'];
    app
      .getHttpAdapter()
      .getInstance()
      .addHook('onSend', (req, reply, payload, done) => {
        if (frameHeaderSkippedPrefixes.some((p) => req.url.startsWith(p))) {
          return done(null, payload);
        }
        reply.header(frameHeader.name, frameHeader.value);
        done(null, payload);
      });
  }

  app
    .getHttpAdapter()
    .getInstance()
    .addHook('onRequest', (request, _reply, done) => {
      (request.raw as any).ip = request.ip;
      done();
    });

  app
    .getHttpAdapter()
    .getInstance()
    .addContentTypeParser(
      'application/scim+json',
      { parseAs: 'string' },
      (_, body, done) => {
        try {
          const json = JSON.parse(body.toString());
          done(null, json);
        } catch (err: any) {
          done(err);
        }
      },
    );

  app
    .getHttpAdapter()
    .getInstance()
    .decorateReply('setHeader', function (name: string, value: unknown) {
      this.header(name, value);
    })
    .decorateReply('end', function () {
      this.send('');
    })
    .addHook('preHandler', function (req, reply, done) {
      // don't require workspaceId for the following paths
      const excludedPaths = [
        '/api/auth/setup',
        '/api/auth/exchange',
        '/api/health',
        '/api/billing/stripe/webhook',
        '/api/workspace/check-hostname',
        '/api/sso/google',
        '/api/workspace/create',
        '/api/workspace/joined',
        '/api/workspace/find-by-email',
        '/api/workspace/verify-email',
        '/api/workspace/resend-verification',
        '/api/workspace/domain-ask',
      ];

      if (
        req.originalUrl.startsWith('/api') &&
        !excludedPaths.some((path) => req.originalUrl.startsWith(path))
      ) {
        if (!req.raw?.['workspaceId'] && req.originalUrl !== '/api') {
          throw new NotFoundException('Workspace not found');
        }
        done();
      } else {
        done();
      }
    });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      stopAtFirstError: true,
      transform: true,
    }),
  );

  app.enableCors();
  app.useGlobalInterceptors(new TransformHttpResponseInterceptor(reflector));
  app.enableShutdownHooks();

  const logger = new Logger('NestApplication');

  process.on('unhandledRejection', (reason, promise) => {
    logger.error(`UnhandledRejection, reason: ${reason}`, promise);
  });

  process.on('uncaughtException', (error) => {
    logger.error('UncaughtException:', error);
  });

  const port = process.env.PORT || 3000;
  const host = process.env.HOST || '0.0.0.0';
  await app.listen(port, host, () => {
    logger.log(
      `Listening on http://127.0.0.1:${port} / ${process.env.APP_URL}`,
    );
  });
}

bootstrap();
