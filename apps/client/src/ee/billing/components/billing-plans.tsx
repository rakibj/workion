import {
  Button,
  Card,
  List,
  ThemeIcon,
  Title,
  Text,
  Group,
  Container,
  Stack,
} from "@mantine/core";
import { IconCheck } from "@tabler/icons-react";
import { getCheckoutLink } from "@/ee/billing/services/billing-service.ts";
import { useBillingPlans } from "@/ee/billing/queries/billing-query.ts";

export default function BillingPlans() {
  const { data: plans } = useBillingPlans();
  const handleCheckout = async (variantId: string | null) => {
    if (!variantId) return;
    try {
      const checkoutLink = await getCheckoutLink({
        variantId,
      });
      window.location.href = checkoutLink.url;
    } catch (err) {
      console.error("Failed to get checkout link", err);
    }
  };

  if (!plans || plans.length === 0) {
    return null;
  }

  return (
    <Container size="xl" py="xl">
      <Group justify="center" gap="lg" align="stretch">
        {plans.map((plan) => {
          const variantId = plan.monthlyId;
          return (
            <Card
              key={plan.name}
              withBorder
              radius="lg"
              shadow="sm"
              p="xl"
              w={350}
              miw={300}
              style={{
                position: "relative",
              }}
            >
              <Stack gap="lg">
                {/* Plan Header */}
                <Stack gap="xs">
                  <Title order={3} size="h4">
                    {plan.name}
                  </Title>
                  {plan.description && (
                    <Text size="sm" c="dimmed">
                      {plan.description}
                    </Text>
                  )}
                </Stack>

                {/* Pricing */}
                <Stack gap="xs">
                  <Group align="baseline" gap="xs">
                    <Title order={1} size="h1">
                      ${plan.price.monthly}
                    </Title>
                    <Text size="lg" c="dimmed">
                      per month
                    </Text>
                  </Group>
                  <Text size="sm" c="dimmed">
                    Billed monthly
                  </Text>
                </Stack>

                {/* CTA Button */}
                <Button onClick={() => handleCheckout(variantId)} disabled={!variantId} fullWidth>
                  Subscribe
                </Button>

                {/* Features */}
                <List
                  spacing="xs"
                  size="sm"
                  icon={
                    <ThemeIcon size={20} radius="xl">
                      <IconCheck size={14} />
                    </ThemeIcon>
                  }
                >
                  {plan.features.map((feature, featureIndex) => (
                    <List.Item key={featureIndex}>{feature}</List.Item>
                  ))}
                </List>
              </Stack>
            </Card>
          );
        })}
      </Group>
    </Container>
  );
}
