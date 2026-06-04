import React from "react";
import { Group, Text } from "@mantine/core";
import classes from "./auth.module.css";
import logoUrl from "@/assets/logo-workion.svg";

type AuthLayoutProps = {
  children: React.ReactNode;
};

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <>
      <Group justify="center" gap={8} className={classes.logo}>
        <img
          src={logoUrl}
          alt="Workion"
          width={28}
          height={28}
          style={{ borderRadius: 6 }}
        />
        <Text size="28px" fw={700} style={{ userSelect: "none" }}>
          Workion
        </Text>
      </Group>
      <main>{children}</main>
    </>
  );
}
