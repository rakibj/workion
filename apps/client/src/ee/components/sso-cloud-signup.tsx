import { Button, Divider, Stack } from "@mantine/core";
import { getGoogleSignupUrl } from "@/ee/security/sso.utils.ts";
import { GoogleIcon } from "@/components/icons/google-icon.tsx";

export default function SsoCloudSignup({
  label = "Sign up with Google",
}: {
  label?: string;
}) {
  const handleSsoLogin = () => {
    window.location.href = getGoogleSignupUrl();
  };

  return (
    <>
      <Stack align="stretch" justify="center" gap="sm">
        <Button
          onClick={handleSsoLogin}
          leftSection={<GoogleIcon size={16} />}
          variant="default"
          fullWidth
        >
          {label}
        </Button>
      </Stack>
      <Divider my="xs" label="OR" labelPosition="center" />
    </>
  );
}
