import {
  Alert,
  Anchor,
  Badge,
  Box,
  Button,
  Container,
  Divider,
  Loader,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { zod4Resolver } from "mantine-form-zod-resolver";
import { z } from "zod/v4";
import { useNavigate, useParams } from "react-router-dom";
import { useState } from "react";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import { IconAlertCircle, IconUsers } from "@tabler/icons-react";
import { AuthLayout } from "./auth-layout.tsx";
import { useInviteLinkPublicInfoQuery } from "@/features/space/queries/space-invite-link-query";
import {
  guestJoin,
  guestSignup,
} from "@/features/space/services/space-invite-link-service";
import useCurrentUser from "@/features/user/hooks/use-current-user";
import { queryClient } from "@/main.tsx";
import classes from "./auth.module.css";
import { Link } from "react-router-dom";
import APP_ROUTE from "@/lib/app-route.ts";

const signupSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.email("Valid email required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

type SignupValues = z.infer<typeof signupSchema>;

export default function InviteLinkPage() {
  const { t } = useTranslation();
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"choose" | "signup" | "login-join">("choose");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: info, isLoading, isError } = useInviteLinkPublicInfoQuery(token!);
  const { data: currentUserData } = useCurrentUser();
  const isLoggedIn = !!currentUserData?.user;

  const form = useForm<SignupValues>({
    validate: zod4Resolver(signupSchema),
    initialValues: { name: "", email: "", password: "" },
  });

  const handleSignup = async (values: SignupValues) => {
    setIsSubmitting(true);
    try {
      await guestSignup({ token: token!, ...values });
      await queryClient.invalidateQueries({ queryKey: ["currentUser"] });
      navigate("/home");
    } catch (err) {
      notifications.show({
        message: err.response?.data?.message ?? t("Something went wrong"),
        color: "red",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleJoin = async () => {
    setIsSubmitting(true);
    try {
      await guestJoin(token!);
      await queryClient.invalidateQueries({ queryKey: ["currentUser"] });
      navigate("/home");
      notifications.show({
        message:
          info?.spaceRole === "none"
            ? t("You've joined the workspace. A space admin will grant you access.")
            : t("You've joined the space!"),
      });
    } catch (err) {
      notifications.show({
        message: err.response?.data?.message ?? t("Something went wrong"),
        color: "red",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <AuthLayout>
        <Container size={420} className={classes.container}>
          <Box p="xl" style={{ textAlign: "center" }}>
            <Loader size="sm" />
          </Box>
        </Container>
      </AuthLayout>
    );
  }

  if (isError || !info) {
    return (
      <AuthLayout>
        <Container size={420} className={classes.container}>
          <Box p="xl" className={classes.containerBox}>
            <Alert icon={<IconAlertCircle size={16} />} color="red">
              {t("This invite link is invalid or no longer available.")}
            </Alert>
          </Box>
        </Container>
      </AuthLayout>
    );
  }

  if (info.isExpired || info.isDisabled) {
    return (
      <AuthLayout>
        <Container size={420} className={classes.container}>
          <Box p="xl" className={classes.containerBox}>
            <Alert icon={<IconAlertCircle size={16} />} color="orange">
              {info.isExpired
                ? t("This invite link has expired.")
                : t("This invite link has been disabled.")}
            </Alert>
          </Box>
        </Container>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <Container size={420} className={classes.container}>
        <Box p="xl" className={classes.containerBox}>
          <Stack align="center" gap="xs" mb="lg">
            <IconUsers size={36} stroke={1.5} />
            <Title order={2} fw={500} ta="center">
              {t("You're invited to join")}
            </Title>
            <Text fw={600} size="lg" ta="center">
              {info.spaceName}
            </Text>
            <Text size="sm" c="dimmed" ta="center">
              {info.workspaceName}
            </Text>
            {info.spaceRole === "none" ? (
              <Badge variant="light" size="sm" color="orange">
                {t("Workspace guest — no space access yet")}
              </Badge>
            ) : (
              <Badge variant="light" size="sm">
                {t("Join as")} {info.spaceRole}
              </Badge>
            )}
          </Stack>

          <Divider mb="md" />

          {isLoggedIn ? (
            <Stack>
              <Text size="sm" ta="center" c="dimmed">
                {t("You are logged in as")} <strong>{currentUserData.user.email}</strong>.
              </Text>
              <Button onClick={handleJoin} loading={isSubmitting} fullWidth>
                {t("Join space")}
              </Button>
              <Text size="xs" ta="center" c="dimmed">
                {t("Not you?")}{" "}
                <Anchor component={Link} to={APP_ROUTE.AUTH.LOGIN}>
                  {t("Sign in with a different account")}
                </Anchor>
              </Text>
            </Stack>
          ) : mode === "choose" ? (
            <Stack>
              <Button fullWidth onClick={() => setMode("signup")}>
                {t("Create account")}
              </Button>
              <Button
                variant="default"
                fullWidth
                component={Link}
                to={`${APP_ROUTE.AUTH.LOGIN}?redirect=/invite/${token}`}
              >
                {t("Sign in to existing account")}
              </Button>
            </Stack>
          ) : (
            <form onSubmit={form.onSubmit(handleSignup)}>
              <Stack>
                <TextInput
                  label={t("Name")}
                  placeholder={t("Your name")}
                  variant="filled"
                  {...form.getInputProps("name")}
                />
                <TextInput
                  label={t("Email")}
                  type="email"
                  placeholder="email@example.com"
                  variant="filled"
                  {...form.getInputProps("email")}
                />
                <PasswordInput
                  label={t("Password")}
                  placeholder={t("At least 8 characters")}
                  variant="filled"
                  {...form.getInputProps("password")}
                />
                <Button type="submit" fullWidth loading={isSubmitting}>
                  {t("Create account & join")}
                </Button>
                <Text size="xs" ta="center" c="dimmed">
                  <Anchor onClick={() => setMode("choose")}>{t("Back")}</Anchor>
                </Text>
              </Stack>
            </form>
          )}
        </Box>
      </Container>
    </AuthLayout>
  );
}
