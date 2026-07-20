import { getCurrentUser, fetchAuthSession, fetchUserAttributes } from "aws-amplify/auth";

export async function getLoggedInUser() {
  try {
    const user = await getCurrentUser();

    return {
      username: user.username,
      userId: user.userId,
    };
  } catch {
    return null;
  }
}

export async function getUserAttributes() {
  try {
    const attributes = await fetchUserAttributes();
    return attributes;
  } catch (err) {
    console.error(err);
    return null;
  }
}

export async function getBusinessId(): Promise<string | null> {
  try {
    const attributes = await fetchUserAttributes();
    return (attributes as Record<string, string>)["custom:businessId"] ?? null;
  } catch {
    return null;
  }
}

export async function getJwtToken() {
  const session = await fetchAuthSession();

  return session.tokens?.idToken?.toString();
}