import { useAppVersion } from "@/features/workspace/queries/workspace-query.ts";
import { isCloud } from "@/lib/config.ts";
import classes from "@/components/settings/settings.module.css";
import { Text } from "@mantine/core";

export default function AppVersion() {
  const { data: appVersion } = useAppVersion(!isCloud());

  return (
    <div className={classes.text}>
      <Text size="sm" c="dimmed">
        {appVersion?.currentVersion && <>v{appVersion.currentVersion}</>}
      </Text>
    </div>
  );
}
