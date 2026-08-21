import { Section, Text } from 'react-email';
import * as React from 'react';
import { content, paragraph } from '../css/styles';
import { EmailButton, MailBody, getGreetingName } from '../partials/partials';

interface Props {
  username: string;
  verifyLink: string;
}

export const EmailVerificationEmail = ({ username, verifyLink }: Props) => {
  return (
    <MailBody>
      <Section style={content}>
        <Text style={paragraph}>Hi {getGreetingName(username)},</Text>
        <Text style={paragraph}>
          Please verify your email address to finish setting up your
          workspace.
        </Text>
        <Text style={paragraph}>This link is valid for 24 hours.</Text>
      </Section>
      <EmailButton href={verifyLink}>Verify email</EmailButton>
    </MailBody>
  );
};

export default EmailVerificationEmail;
