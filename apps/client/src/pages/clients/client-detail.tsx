import {
  Button,
  Container,
  Group,
  Loader,
  Modal,
  Stack,
  Text,
  TextInput,
  Title,
  Card,
  Badge,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useForm } from "@mantine/form";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  useClientQuery,
  useCreateProjectMutation,
  useLinkClientSpaceMutation,
  useUnlinkClientSpaceMutation,
} from "@/features/client/queries/client-query";
import { useGetSpacesQuery } from "@/features/space/queries/space-query";
import { getSpaceUrl } from "@/lib/config";

export default function ClientDetailPage() {
  const { clientId = "" } = useParams();
  const { data, isLoading } = useClientQuery(clientId);
  const { data: allSpaces } = useGetSpacesQuery({ limit: 100 });
  const [spaceOpened, spaceModal] = useDisclosure(false);
  const [projectOpened, projectModal] = useDisclosure(false);
  const linkSpace = useLinkClientSpaceMutation(clientId);
  const unlinkSpace = useUnlinkClientSpaceMutation(clientId);
  const createProject = useCreateProjectMutation(clientId);
  const navigate = useNavigate();
  const spaceForm = useForm({ initialValues: { spaceId: "" } });
  const projectForm = useForm({
    initialValues: { name: "", spaceId: "", description: "", dueDate: "" },
    validate: {
      name: (v) => (v.trim().length >= 2 ? null : "Enter a project name"),
      spaceId: (v) => (v ? null : "Select a space"),
    },
  });
  if (isLoading)
    return (
      <Container pt="xl">
        <Loader />
      </Container>
    );
  if (!data) return null;
  const linkedIds = new Set(data.spaces.map((space) => space.id));
  const addableSpaces =
    allSpaces?.items?.filter((space) => !linkedIds.has(space.id)) ?? [];
  return (
    <Container size="900" pt="xl">
      <Group justify="space-between" mb="xl">
        <div>
          <Title order={1} size="h3">
            {data.client.name}
          </Title>
          <Badge color={data.client.status === "active" ? "green" : "gray"}>
            {data.client.status}
          </Badge>
        </div>
      </Group>
      <Group justify="space-between" mb="sm">
        <Title order={2} size="h4">
          Linked spaces
        </Title>
        <Button variant="light" onClick={spaceModal.open}>
          Link space
        </Button>
      </Group>
      <Stack mb="xl">
        {data.spaces.map((space) => (
          <Card key={space.id} withBorder>
            <Group justify="space-between">
              <Link to={getSpaceUrl(space.slug)}>{space.name}</Link>
              <Button
                color="red"
                variant="subtle"
                size="xs"
                onClick={() => unlinkSpace.mutate(space.id)}
              >
                Unlink
              </Button>
            </Group>
          </Card>
        ))}
      </Stack>
      <Group justify="space-between" mb="sm">
        <Title order={2} size="h4">
          Projects
        </Title>
        <Button onClick={projectModal.open}>New project</Button>
      </Group>
      <Stack>
        {data.projects.length ? (
          data.projects.map((project) => (
            <Card key={project.id} withBorder>
              <Group justify="space-between">
                <div>
                  <Text fw={600}>{project.name}</Text>
                  <Text size="sm" c="dimmed">
                    {project.description}
                  </Text>
                </div>
                <Button
                  variant="subtle"
                  onClick={() => navigate(`/projects/${project.id}`)}
                >
                  Open project
                </Button>
              </Group>
            </Card>
          ))
        ) : (
          <Text c="dimmed">No projects yet.</Text>
        )}
      </Stack>
      <Modal
        opened={spaceOpened}
        onClose={spaceModal.close}
        title="Link space"
        centered
      >
        <form
          onSubmit={spaceForm.onSubmit(({ spaceId }) =>
            linkSpace.mutate(spaceId, { onSuccess: spaceModal.close }),
          )}
        >
          <Stack>
            <Select
              label="Space"
              data={addableSpaces.map((space) => ({
                value: space.id,
                label: space.name,
              }))}
              {...spaceForm.getInputProps("spaceId")}
            />
            <Button type="submit" loading={linkSpace.isPending}>
              Link space
            </Button>
          </Stack>
        </form>
      </Modal>
      <Modal
        opened={projectOpened}
        onClose={projectModal.close}
        title="New project"
        centered
      >
        <form
          onSubmit={projectForm.onSubmit((values) =>
            createProject.mutate(
              { ...values, clientId, dueDate: values.dueDate || undefined },
              { onSuccess: projectModal.close },
            ),
          )}
        >
          <Stack>
            <TextInput
              label="Project name"
              required
              {...projectForm.getInputProps("name")}
            />
            <TextInput
              label="Description"
              {...projectForm.getInputProps("description")}
            />
            <Select
              label="Space"
              required
              data={data.spaces.map((space) => ({
                value: space.id,
                label: space.name,
              }))}
              {...projectForm.getInputProps("spaceId")}
            />
            <TextInput
              label="Due date"
              type="date"
              {...projectForm.getInputProps("dueDate")}
            />
            <Button type="submit" loading={createProject.isPending}>
              Create project
            </Button>
          </Stack>
        </form>
      </Modal>
    </Container>
  );
}
