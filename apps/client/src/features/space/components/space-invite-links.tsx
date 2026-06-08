import {
  ActionIcon,
  Badge,
  Button,
  CopyButton,
  Divider,
  Group,
  Modal,
  NumberInput,
  ScrollArea,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { useDisclosure } from "@mantine/hooks";
import { modals } from "@mantine/modals";
import { IconCheck, IconCopy, IconLink, IconTrash } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useCreateSpaceInviteLinkMutation,
  useDeleteSpaceInviteLinkMutation,
  useSpaceInviteLinksQuery,
} from "@/features/space/queries/space-invite-link-query";
import { ISpaceInviteLink } from "@/features/space/services/space-invite-link-service";

interface Props {
  spaceId: string;
}

export default function SpaceInviteLinks({ spaceId }: Props) {
  const { t } = useTranslation();
  const { data: links = [], isLoading } = useSpaceInviteLinksQuery(spaceId);
  const createMutation = useCreateSpaceInviteLinkMutation();
  const deleteMutation = useDeleteSpaceInviteLinkMutation();

  const [createOpened, { open: openCreate, close: closeCreate }] =
    useDisclosure(false);
  const [role, setRole] = useState<string>("none");
  const [expiresAt, setExpiresAt] = useState<Date | null | string>(null);
  const [maxUses, setMaxUses] = useState<number | string>("");

  const handleCreate = async () => {
    await createMutation.mutateAsync({
      spaceId,
      spaceRole: role as "none" | "reader" | "writer",
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
      maxUses: maxUses !== "" ? Number(maxUses) : undefined,
    });
    setRole("none");
    setExpiresAt(null);
    setMaxUses("");
    closeCreate();
  };

  const handleDelete = (link: ISpaceInviteLink) => {
    modals.openConfirmModal({
      title: t("Delete invite link"),
      children: (
        <Text size="sm">
          {t(
            "Are you sure you want to delete this invite link? Anyone with this link will no longer be able to join.",
          )}
        </Text>
      ),
      centered: true,
      labels: { confirm: t("Delete"), cancel: t("Cancel") },
      confirmProps: { color: "red" },
      onConfirm: () =>
        deleteMutation.mutate({ spaceId, linkId: link.id }),
    });
  };

  const getRoleBadgeColor = (role: string) =>
    role === "writer" ? "blue" : role === "reader" ? "gray" : "orange";

  const isExpired = (link: ISpaceInviteLink) =>
    link.expiresAt ? new Date() > new Date(link.expiresAt) : false;

  const isMaxed = (link: ISpaceInviteLink) =>
    link.maxUses !== null && link.useCount >= link.maxUses;

  return (
    <>
      <Group justify="flex-end" mt="md">
        <Button
          leftSection={<IconLink size={16} />}
          size="sm"
          onClick={openCreate}
        >
          {t("Create invite link")}
        </Button>
      </Group>

      <ScrollArea h={450}>
        {isLoading ? null : links.length === 0 ? (
          <Text size="sm" c="dimmed" ta="center" mt="xl">
            {t("No invite links yet. Create one to invite guests.")}
          </Text>
        ) : (
          <Table highlightOnHover verticalSpacing={8} mt="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t("Link")}</Table.Th>
                <Table.Th>{t("Role")}</Table.Th>
                <Table.Th>{t("Uses")}</Table.Th>
                <Table.Th>{t("Expires")}</Table.Th>
                <Table.Th aria-label={t("Actions")} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {links.map((link) => (
                <Table.Tr
                  key={link.id}
                  opacity={isExpired(link) || isMaxed(link) ? 0.5 : 1}
                >
                  <Table.Td>
                    <Group gap="xs">
                      <Text
                        size="xs"
                        ff="monospace"
                        c="dimmed"
                        style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                      >
                        {link.inviteUrl}
                      </Text>
                      <CopyButton value={link.inviteUrl} timeout={2000}>
                        {({ copied, copy }) => (
                          <Tooltip
                            label={copied ? t("Copied") : t("Copy link")}
                            withArrow
                          >
                            <ActionIcon
                              size="xs"
                              variant="subtle"
                              c={copied ? "teal" : "gray"}
                              onClick={copy}
                            >
                              {copied ? (
                                <IconCheck size={14} />
                              ) : (
                                <IconCopy size={14} />
                              )}
                            </ActionIcon>
                          </Tooltip>
                        )}
                      </CopyButton>
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Badge
                      size="sm"
                      variant="light"
                      color={getRoleBadgeColor(link.spaceRole)}
                    >
                      {link.spaceRole}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">
                      {link.useCount}
                      {link.maxUses !== null ? ` / ${link.maxUses}` : ""}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    {link.expiresAt ? (
                      <Text size="sm" c={isExpired(link) ? "red" : undefined}>
                        {new Date(link.expiresAt).toLocaleDateString()}
                      </Text>
                    ) : (
                      <Text size="sm" c="dimmed">
                        {t("Never")}
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <ActionIcon
                      variant="subtle"
                      c="red"
                      size="sm"
                      aria-label={t("Delete link")}
                      onClick={() => handleDelete(link)}
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </ScrollArea>

      <Modal
        opened={createOpened}
        onClose={closeCreate}
        title={t("Create invite link")}
        centered
        size="sm"
      >
        <Stack gap="md">
          <Select
            label={t("Access")}
            description={t("The space role granted when joining via this link. \"No access\" lets you grant page-level access manually after they join.")}
            data={[
              { value: "none", label: t("No access (guest)") },
              { value: "reader", label: t("Reader") },
              { value: "writer", label: t("Writer") },
            ]}
            value={role}
            onChange={(v) => setRole(v ?? "none")}
          />

          <DatePickerInput
            label={t("Expiry date")}
            description={t("Leave blank for no expiry")}
            placeholder={t("Pick a date")}
            value={expiresAt}
            onChange={setExpiresAt}
            minDate={new Date()}
            clearable
          />

          <NumberInput
            label={t("Max uses")}
            description={t("Leave blank for unlimited uses")}
            placeholder={t("Unlimited")}
            min={1}
            value={maxUses}
            onChange={setMaxUses}
          />

          <Divider />

          <Group justify="flex-end">
            <Button variant="default" onClick={closeCreate}>
              {t("Cancel")}
            </Button>
            <Button
              onClick={handleCreate}
              loading={createMutation.isPending}
            >
              {t("Create link")}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
