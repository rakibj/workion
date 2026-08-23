import {
  Anchor,
  Button,
  Card,
  Container,
  Group,
  Loader,
  Modal,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { useForm } from "@mantine/form";
import { useGetSpacesQuery } from "@/features/space/queries/space-query";
import {
  useClientsQuery,
  useCreateClientMutation,
} from "@/features/client/queries/client-query";
import { getAppName } from "@/lib/config";
import { getSpaceUrl } from "@/lib/config";

export default function ClientsPage() {
  const [opened, { open, close }] = useDisclosure(false);
  const { data: clients, isLoading } = useClientsQuery();
  const { data: spaces } = useGetSpacesQuery({ limit: 100 });
  const createClient = useCreateClientMutation();
  const form = useForm({
    initialValues: { name: "", spaceId: "" },
    validate: {
      name: (v) => (v.trim().length >= 2 ? null : "Enter a client name"),
      spaceId: (v) => (v ? null : "Select a space"),
    },
  });

  return (
    <Container size="900" pt="xl">
      <Helmet>
        <title>Clients - {getAppName()}</title>
      </Helmet>
      <Group justify="space-between" mb="xl">
        <Title order={1} size="h3">
          Clients
        </Title>
        <Button onClick={open}>New client</Button>
      </Group>
      {isLoading ? (
        <Loader />
      ) : clients?.length ? (
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          {clients.map((client) => (
            <Card
              key={client.id}
              withBorder
              radius="md"
              p="lg"
            >
              <Group justify="space-between">
                <Anchor component={Link} to={`/clients/${client.id}`} fw={600}>
                  {client.name}
                </Anchor>
                <Text
                  size="xs"
                  c={client.status === "active" ? "green" : "dimmed"}
                >
                  {client.status}
                </Text>
              </Group>
              <Text size="xs" c="dimmed" mt="md" mb={4}>
                Linked spaces
              </Text>
              {client.spaces.length ? (
                <Group gap="xs">
                  {client.spaces.map((space) => (
                    <Anchor
                      key={space.id}
                      component={Link}
                      to={getSpaceUrl(space.slug)}
                      size="sm"
                    >
                      {space.name}
                    </Anchor>
                  ))}
                </Group>
              ) : (
                <Text size="sm" c="dimmed">
                  No linked spaces
                </Text>
              )}
            </Card>
          ))}
        </SimpleGrid>
      ) : (
        <Text c="dimmed">
          No clients yet. Create one to connect your client work across spaces.
        </Text>
      )}
      <Modal opened={opened} onClose={close} title="New client" centered>
        <form
          onSubmit={form.onSubmit((values) =>
            createClient.mutate(values, { onSuccess: close }),
          )}
        >
          <Stack>
            <TextInput
              label="Client name"
              required
              {...form.getInputProps("name")}
            />
            <Select
              label="First linked space"
              required
              data={
                spaces?.items?.map((space) => ({
                  value: space.id,
                  label: space.name,
                })) ?? []
              }
              {...form.getInputProps("spaceId")}
            />
            <Button type="submit" loading={createClient.isPending}>
              Create client
            </Button>
          </Stack>
        </form>
      </Modal>
    </Container>
  );
}
