import {
  ActionIcon,
  Button,
  Container,
  Group,
  Loader,
  Modal,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
  Card,
  Badge,
  Tooltip,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useForm } from "@mantine/form";
import { modals } from "@mantine/modals";
import { IconTrash } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  useArchiveClientMutation,
  useClientQuery,
  useCreateProjectMutation,
  useLinkClientSpaceMutation,
  useUnlinkClientSpaceMutation,
} from "@/features/client/queries/client-query";
import { useGetSpacesQuery } from "@/features/space/queries/space-query";
import { getSpaceUrl } from "@/lib/config";

export default function ClientDetailPage() {
  const { t } = useTranslation();
  const { clientId = "" } = useParams();
  const { data, isLoading } = useClientQuery(clientId);
  const { data: allSpaces } = useGetSpacesQuery({ limit: 100 });
  const [spaceOpened, spaceModal] = useDisclosure(false);
  const [projectOpened, projectModal] = useDisclosure(false);
  const linkSpace = useLinkClientSpaceMutation(clientId);
  const unlinkSpace = useUnlinkClientSpaceMutation(clientId);
  const createProject = useCreateProjectMutation(clientId);
  const archiveClient = useArchiveClientMutation();
  const navigate = useNavigate();

  const handleDeleteClient = () => {
    if (!data) return;
    modals.openConfirmModal({
      title: t("Delete client"),
      children: (
        <Text size="sm">
          {t(
            "Are you sure you want to delete {{name}}? This does not delete its linked spaces or pages.",
            { name: data.client.name },
          )}
        </Text>
      ),
      centered: true,
      labels: { confirm: t("Delete"), cancel: t("Cancel") },
      confirmProps: { color: "red" },
      onConfirm: () => archiveClient.mutate(clientId),
    });
  };
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
        <Tooltip label={t("Delete client")}>
          <ActionIcon
            color="red"
            variant="subtle"
            onClick={handleDeleteClient}
            loading={archiveClient.isPending}
          >
            <IconTrash size={18} />
          </ActionIcon>
        </Tooltip>
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
