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
    message: `Hi ${params.userName},<br><br>
You've been invited to join MarketingAI as a ${params.role}.<br><br>
Your secure invitation link: <a href="${invitationLink}">${invitationLink}</a><br><br>
This link expires in 24 hours.<br><br>
If you experience any issues signing in, accessing your account, or completing setup, our IT Experts are ready to help.<br><br>
<strong>IT Expert System, INC</strong><br>
Address: 951 N Plum Grove Rd, Suite A, Schaumburg, IL 60173<br>
Phone: (847) 350-9034<br>
Hours: Monday to Saturday 7:45 AM – 9:00 PM, Sunday 9:00 AM – 5:00 PM`,
  });
}
