import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, "60 s"),
});

export async function checkRateLimit(userId: string): Promise<boolean> {
  const { success } = await ratelimit.limit(userId);
  return success;
}
