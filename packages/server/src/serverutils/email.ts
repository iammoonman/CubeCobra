// Load Environment Variables
import dotenv from 'dotenv';
dotenv.config();

import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import { fromNodeProviderChain } from '@aws-sdk/credential-providers';
import Email from 'email-templates';
import { createTransport } from 'nodemailer';
import path from 'path';

import * as utils from './util';

const ses = new SESv2Client({
  endpoint: process.env.AWS_ENDPOINT || undefined,
  credentials: fromNodeProviderChain(),
  region: process.env.AWS_REGION || 'us-east-2',
});

const transporter = createTransport({
  SES: { sesClient: ses, SendEmailCommand },
});

export const sendEmail = async (
  to: string,
  subject: string,
  templateName: string,
  templateLocals: Record<string, any> = {},
): Promise<any> => {
  const message = new Email({
    message: {
      from: 'Cube Cobra Team <support@cubecobra.com>',
      to,
      subject,
    },
    send: true,
    juiceResources: {
      webResources: {
        relativeTo: path.join(__dirname, '..', 'public'),
        images: true,
      },
    },
    transport: transporter,
    views: {
      root: path.join(__dirname, '..', 'emails'),
    },
  });

  if (process.env.NODE_ENV === 'production' || process.env.LOCALSTACK_SES === 'true') {
    await message.send({
      template: templateName,
      locals: {
        ...templateLocals,
        //Ensure the common ones cannot be overridden by adding second
        baseUrl: utils.getBaseUrl(),
      },
    });
  } else {
    // In development, just log the email to the console

    console.log(message);
  }

  return;
};
export default sendEmail;
