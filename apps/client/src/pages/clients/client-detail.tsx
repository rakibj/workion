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
import { IconPencil, IconStar, IconTrash } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  useArchiveClientMutation,
  useClientQuery,
  useCreateProjectMutation,
  useLinkClientSpaceMutation,
  useUnlinkClientSpaceMutation,
  useCreateClientContactMutation,
  useDeleteClientContactMutation,
  useUpdateClientContactMutation,
} from "@/features/client/queries/client-query";
import { useGetSpacesQuery } from "@/features/space/queries/space-query";
import { getSpaceUrl } from "@/lib/config";
import { IClientContact } from "@/features/client/types/client.types";

export default function ClientDetailPage() {
  const { t } = useTranslation();
  const { clientId = "" } = useParams();
  const { data, isLoading } = useClientQuery(clientId);
  const { data: allSpaces } = useGetSpacesQuery({ limit: 100 });
  const [spaceOpened, spaceModal] = useDisclosure(false);
  const [projectOpened, projectModal] = useDisclosure(false);
  const [contactOpened, contactModal] = useDisclosure(false);
  const [editContact, setEditContact] = useState<IClientContact | null>(null);
  const linkSpace = useLinkClientSpaceMutation(clientId);
  const unlinkSpace = useUnlinkClientSpaceMutation(clientId);
  const createProject = useCreateProjectMutation(clientId);
  const archiveClient = useArchiveClientMutation();
  const createContact = useCreateClientContactMutation(clientId);
  const updateContact = useUpdateClientContactMutation(clientId);
  const deleteContact = useDeleteClientContactMutation(clientId);
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
  const contactForm = useForm({
    initialValues: { name: "", email: "", phone: "", title: "" },
    validate: {
      name: (v) => (v.trim() ? null : "Enter a contact name"),
      email: (v) => (/^\S+@\S+\.\S+$/.test(v) ? null : "Enter a valid email"),
    },
  });
  const editContactForm = useForm({
    initialValues: { name: "", email: "", phone: "", title: "" },
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
        {data.canManage && (
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
        )}
      </Group>
      <Group justify="space-between" mb="sm">
        <Title order={2} size="h4">
          Linked spaces
        </Title>
        {data.canManage && (
          <Button variant="light" onClick={spaceModal.open}>
            Link space
          </Button>
        )}
      </Group>
      <Stack mb="xl">
        {data.spaces.map((space) => (
          <Card key={space.id} withBorder>
            <Group justify="space-between">
              <Link to={getSpaceUrl(space.slug)}>{space.name}</Link>
              {data.canManage && (
                <Button
                  color="red"
                  variant="subtle"
                  size="xs"
                  onClick={() => unlinkSpace.mutate(space.id)}
                >
                  Unlink
                </Button>
              )}
            </Group>
          </Card>
        ))}
      </Stack>
      <Group justify="space-between" mb="sm">
        <Title order={2} size="h4">
          Contacts
        </Title>
        {data.canManage && (
          <Button onClick={contactModal.open}>Add contact</Button>
        )}
      </Group>
      <Stack mb="xl">
        {data.contacts.length ? (
          data.contacts.map((contact) => (
            <Card key={contact.id} withBorder>
              <Group justify="space-between" align="flex-start">
                <div>
                  <Group gap="xs">
                    <Text fw={600}>{contact.name}</Text>
                    {contact.source === "guest_invite" && (
                      <Badge variant="light">Portal user</Badge>
                    )}
                  </Group>
                  {contact.title && <Text size="sm">{contact.title}</Text>}
                  {contact.email && (
                    <Text size="sm" c="dimmed">
                      {contact.email}
                    </Text>
                  )}
                  {contact.phone && (
                    <Text size="sm" c="dimmed">
                      {contact.phone}
                    </Text>
                  )}
                </div>
                <Group gap={4}>
                  {data.canManage && (
                    <Tooltip
                      label={
                        contact.isPrimary
                          ? "Primary contact"
                          : "Mark as primary"
                      }
                    >
                      <ActionIcon
                        variant="subtle"
                        color={contact.isPrimary ? "yellow" : "gray"}
                        onClick={() =>
                          updateContact.mutate({
                            contactId: contact.id,
                            data: { isPrimary: !contact.isPrimary },
                          })
                        }
                      >
                        <IconStar
                          size={18}
                          fill={contact.isPrimary ? "currentColor" : "none"}
                        />
                      </ActionIcon>
                    </Tooltip>
                  )}
                  {data.canManage && (
                    <ActionIcon
                      variant="subtle"
                      onClick={() => {
                        setEditContact(contact);
                        editContactForm.setValues({
                          name: contact.name,
                          email: contact.email ?? "",
                          phone: contact.phone ?? "",
                          title: contact.title ?? "",
                        });
                      }}
                    >
                      <IconPencil size={18} />
                    </ActionIcon>
                  )}
                  {data.canManage && (
                    <ActionIcon
                      color="red"
                      variant="subtle"
                      onClick={() =>
                        modals.openConfirmModal({
                          title: "Delete contact",
                          children: (
                            <Text size="sm">
                              Remove {contact.name} from this client? This does
                              not remove portal access.
                            </Text>
                          ),
                          centered: true,
                          labels: { confirm: "Delete", cancel: "Cancel" },
                          confirmProps: { color: "red" },
                          onConfirm: () => deleteContact.mutate(contact.id),
                        })
                      }
                    >
                      <IconTrash size={18} />
                    </ActionIcon>
                  )}
                </Group>
              </Group>
            </Card>
          ))
        ) : (
          <Text c="dimmed">No contacts yet.</Text>
        )}
      </Stack>
      <Group justify="space-between" mb="sm">
        <Title order={2} size="h4">
          Projects
        </Title>
        {data.canManage && (
          <Button onClick={projectModal.open}>New project</Button>
        )}
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
        opened={!!editContact}
        onClose={() => setEditContact(null)}
        title="Edit contact"
        centered
      >
        <form
          onSubmit={editContactForm.onSubmit((values) => {
            if (!editContact) return;
            const update = {
              phone: values.phone || null,
              title: values.title || null,
              ...(editContact.source === "manual"
                ? { name: values.name, email: values.email }
                : {}),
            };
            updateContact.mutate(
              { contactId: editContact.id, data: update },
              { onSuccess: () => setEditContact(null) },
            );
          })}
        >
          <Stack>
            <TextInput
              label="Name"
              disabled={editContact?.source === "guest_invite"}
              {...editContactForm.getInputProps("name")}
            />
            <TextInput
              label="Email"
              type="email"
              disabled={editContact?.source === "guest_invite"}
              {...editContactForm.getInputProps("email")}
            />
            <TextInput
              label="Title"
              {...editContactForm.getInputProps("title")}
            />
            <TextInput
              label="Phone"
              {...editContactForm.getInputProps("phone")}
            />
            <Button type="submit" loading={updateContact.isPending}>
              Save changes
            </Button>
          </Stack>
        </form>
      </Modal>
      <Modal
        opened={contactOpened}
        onClose={contactModal.close}
        title="Add contact"
        centered
      >
        <form
          onSubmit={contactForm.onSubmit((values) =>
            createContact.mutate(values, {
              onSuccess: () => {
                contactForm.reset();
                contactModal.close();
              },
            }),
          )}
        >
          <Stack>
            <TextInput
              label="Name"
              required
              {...contactForm.getInputProps("name")}
            />
            <TextInput
              label="Email"
              type="email"
              required
              {...contactForm.getInputProps("email")}
            />
            <TextInput label="Title" {...contactForm.getInputProps("title")} />
            <TextInput label="Phone" {...contactForm.getInputProps("phone")} />
            <Button type="submit" loading={createContact.isPending}>
              Add contact
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
