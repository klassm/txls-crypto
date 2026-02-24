export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET environment variable is required");
    }
  }
}