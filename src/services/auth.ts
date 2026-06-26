import { getCurrentUser, fetchAuthSession } from "aws-amplify/auth";

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

export async function getJwtToken() {
  const session = await fetchAuthSession();

  return session.tokens?.idToken?.toString();
}