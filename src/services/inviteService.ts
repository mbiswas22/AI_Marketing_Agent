import { inviteUser, sendInviteEmail } from "./api";

export interface SendUserInviteParams {
  businessId: string;
  businessName: string;
  userName: string;
  userId: string;
  role: string;
  userEmail: string;
  userPhoneNumber?: string;
}

export async function sendUserInvite(params: SendUserInviteParams): Promise<void> {
  const token = params.userId ?? crypto.randomUUID();
  const invitationLink = `${window.location.origin}/invite?token=${token}`;

  await inviteUser({
    invitationId: token,
    invitationLink,
    expirationTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    businessId: params.businessId,
    businessName: params.businessName,
    userName: params.userName,
    userId: params.userId,
    role: params.role,
    userEmail: params.userEmail,
    userPhoneNumber: params.userPhoneNumber ?? "",
  });

  await sendInviteEmail({
    toEmail: params.userEmail,
    subject: "You're invited to MarketingAI",
    message: `Hi ${params.userName},\n\nYou've been invited to join MarketingAI as ${params.role}.\n\nAccept your invitation here: ${invitationLink}\n\nThis link expires in 24 hours.`,
  });
}
