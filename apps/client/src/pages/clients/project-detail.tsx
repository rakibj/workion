import {
  Button,
  Container,
  Group,
  Loader,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { Link, useParams } from "react-router-dom";
import { useEffect } from "react";
import {
  useProjectQuery,
  useUpdateProjectMutation,
} from "@/features/client/queries/client-query";
import { PROJECT_STATUSES } from "@/features/client/types/project-status";
import { getSpaceUrl } from "@/lib/config";
import { useSpaceQuery } from "@/features/space/queries/space-query";

export default function ProjectDetailPage() {
  const { projectId = "" } = useParams();
  const { data: project, isLoading } = useProjectQuery(projectId);
  const { data: space } = useSpaceQuery(project?.spaceId ?? "");
  const updateProject = useUpdateProjectMutation(project?.clientId ?? "");
  const form = useForm({
    initialValues: {
      name: project?.name ?? "",
      description: project?.description ?? "",
      dueDate: project?.dueDate?.slice(0, 10) ?? "",
      status: project?.status ?? "planning",
    },
  });

  useEffect(() => {
    if (project && !form.isDirty()) {
      form.setValues({
        name: project.name,
        description: project.description ?? "",
        dueDate: project.dueDate?.slice(0, 10) ?? "",
        status: project.status,
      });
    }
  }, [project]);

  if (isLoading)
    return (
      <Container pt="xl">
        <Loader />
      </Container>
    );
  if (!project) return null;

  return (
    <Container size="700" pt="xl">
      <Group justify="space-between" mb="xl">
        <Title order={1} size="h3">
          Project
        </Title>
        <Button
          component={Link}
          variant="light"
          to={`/clients/${project.clientId}`}
        >
          Back to client
        </Button>
      </Group>
      <form
        onSubmit={form.onSubmit((values) =>
          updateProject.mutate({
            projectId: project.id,
            data: {
              ...values,
              dueDate: values.dueDate || undefined,
              status: values.status as typeof project.status,
            },
          }),
        )}
      >
        <Stack>
          <TextInput label="Name" required {...form.getInputProps("name")} />
          <TextInput
            label="Description"
            {...form.getInputProps("description")}
          />
          <Select
            label="Status"
            data={PROJECT_STATUSES.map((status) => ({
              value: status,
              label: status.replace(/_/g, " "),
            }))}
            {...form.getInputProps("status")}
          />
          <TextInput
            label="Due date"
            type="date"
            {...form.getInputProps("dueDate")}
          />
          <Text size="sm">
            Work lives in the linked{" "}
            {space ? <Link to={getSpaceUrl(space.slug)}>space</Link> : "space"}.
          </Text>
          <Button type="submit" loading={updateProject.isPending}>
            Save project
          </Button>
        </Stack>
      </form>
    </Container>
  );
}
