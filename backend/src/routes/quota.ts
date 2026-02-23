import { Hono } from "hono";

import { quotaService } from "../services/quota-service.js";

const unauthorizedResponse = {
  error: {
    code: "UNAUTHORIZED",
    message: "Missing or invalid authentication credentials",
  },
};

export const createQuotaRoutes = () => {
  const quotaRoutes = new Hono<{ Variables: { authId?: string } }>();

  quotaRoutes.get("/", async (c) => {
    const authId = c.get("authId");
    if (typeof authId !== "string" || authId.length === 0) {
      return c.json(unauthorizedResponse, 401);
    }

    const status = await quotaService.getQuotaStatus(authId);

    return c.json(
      {
        used: status.used,
        limit: status.limit,
        remaining: status.remaining,
        resetsAt: status.resetsAt,
        hasOwnKey: false,
      },
      200
    );
  });

  return quotaRoutes;
};

export const quotaRoutes = createQuotaRoutes();

export default quotaRoutes;
