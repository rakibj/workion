import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Badge,
  Box,
  Button,
  Card,
  Container,
  Group,
  List,
  Stack,
  Switch,
  Text,
  Title,
} from '@mantine/core';
import { IconCheck } from '@tabler/icons-react';
import { Helmet } from 'react-helmet-async';
import { getAppName } from '@/lib/config.ts';

const plans = [
  { name: 'Solo Founder', monthly: 9, launch: 5, spaces: 3, description: 'For independent founders.', features: ['Up to 3 spaces', '1 client', 'Up to 3 users'] },
  { name: 'Startup', monthly: 19, launch: 9, spaces: 10, description: 'For growing teams.', features: ['Up to 10 spaces', 'Up to 10 clients', 'Up to 10 users'] },
];

export default function PricingPage() {
  const [showLaunchOffer, setShowLaunchOffer] = useState(true);

  return (
    <Box mih="100vh" py={{ base: 48, sm: 88 }} bg="gray.0">
      <Helmet>
        <title>Pricing - {getAppName()}</title>
      </Helmet>
      <Container size="lg">
        <Stack align="center" gap="md" mb={56} ta="center">
          <Badge variant="light" size="lg">Simple, transparent pricing</Badge>
          <Title order={1} size="3rem" maw={700}>
            Give every client a workspace they’ll love to use.
          </Title>
          <Text c="dimmed" size="lg" maw={620}>
            Start with a 14-day free trial. One focused plan for founders who want a better way to work with clients.
          </Text>
          <Group gap="sm" mt="sm">
            <Switch checked={showLaunchOffer} onChange={(event) => setShowLaunchOffer(event.currentTarget.checked)} />
            <Text fw={showLaunchOffer ? 600 : 400}>Show founder offer</Text>
            <Badge color="green" variant="light">$5 for your first 3 months</Badge>
          </Group>
        </Stack>

        <Group align="stretch" justify="center" gap="xl">
          {plans.map((plan) => <Card key={plan.name} withBorder radius="lg" shadow="sm" p="xl" w={360} maw="100%">
                <Stack h="100%" gap="lg">
                  <div>
                    <Title order={2}>{plan.name}</Title>
                    <Text c="dimmed" mt="xs" mih={48}>{plan.description}</Text>
                  </div>
                  <div>
                    <Group gap={4} align="baseline">
                      <Title order={3} size="3rem">${showLaunchOffer ? plan.launch : plan.monthly}</Title>
                      <Text c="dimmed">/ month</Text>
                    </Group>
                    <Text size="sm" c="dimmed">
                      {showLaunchOffer ? `Then $${plan.monthly}/month. Applied automatically at checkout.` : 'Billed monthly'}
                    </Text>
                  </div>
                  <Button component={Link} to="/create" size="md" fullWidth>
                    Start free trial
                  </Button>
                  <List spacing="sm" icon={<IconCheck size={18} />}>
                    {plan.features.map((feature) => <List.Item key={feature}>{feature}</List.Item>)}
                  </List>
                </Stack>
              </Card>)}
        </Group>
        <Text ta="center" c="dimmed" size="sm" mt="xl">
          No card required to begin your trial. Taxes are calculated by Lemon Squeezy at checkout.
        </Text>
      </Container>
    </Box>
  );
}
