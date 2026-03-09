import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getUserIdFromRequest, getUserIdFromCookie } from "./session.js";
import { HassSupervisorError } from "./errors.js";
import { getDataSource } from "../database.js";

vi.mock("../config/env.js", () => ({
  config: {
    homeAssistant: {
      supervisorToken: "test-supervisor-token",
    },
    logging: {
      level: "info",
    },
  },
}));

vi.mock("../common/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("../database.js", () => ({
  getDataSource: vi.fn(),
}));

vi.mock("../modules/users/users.service.js", () => ({
  UsersService: vi.fn().mockImplementation(() => ({
    findByUsername: vi.fn(),
    createUser: vi.fn(),
  })),
}));

vi.mock("./password.js", () => ({
  AUTH_COOKIE_NAME: "txls_auth",
  verifyToken: vi.fn((token: string) => {
    if (token === "valid-token") {
      return { userId: 123, username: "testuser", email: "test@example.com", isAdmin: false };
    }
    return null;
  }),
}));

describe("session", () => {
  let mockFetch: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch = vi.fn();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getUserIdFromCookie", () => {
    it("should return null when no cookie header", () => {
      const req = { headers: {} } as any;
      expect(getUserIdFromCookie(req)).toBeNull();
    });

    it("should return null when no auth cookie", () => {
      const req = { headers: { cookie: "other=value" } } as any;
      expect(getUserIdFromCookie(req)).toBeNull();
    });

    it("should return null when invalid token", () => {
      const req = { headers: { cookie: "txls_auth=invalid-token" } } as any;
      expect(getUserIdFromCookie(req)).toBeNull();
    });

    it("should return userId when valid token", () => {
      const req = { headers: { cookie: "txls_auth=valid-token" } } as any;
      expect(getUserIdFromCookie(req)).toBe(123);
    });
  });

  describe("getUserIdFromRequest", () => {
    describe("HASS ingress mode", () => {
      it("should return userId from cookie when present", async () => {
        const req = {
          headers: {
            "x-ingress-path": "/api/hassio_ingress/test",
            cookie: "txls_auth=valid-token",
          },
        } as any;

        const result = await getUserIdFromRequest(req);
        expect(result).toBe(123);
      });

      it("should validate HASS token when no cookie", async () => {
        const mockUserEntity = { id: 456, username: "hassuser", name: "hassuser", email: "hassuser@hass.local", password: "hash", salt: "", isAdmin: false };
        
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: { user: { name: "hassuser", is_owner: false } },
          }),
        });

        const mockFindByUsername = vi.fn().mockResolvedValue(mockUserEntity);
        const mockCreateUser = vi.fn();
        
        vi.doMock("../modules/users/users.service.js", () => ({
          UsersService: vi.fn().mockImplementation(() => ({
            findByUsername: mockFindByUsername,
            createUser: mockCreateUser,
          })),
        }));

        const mockDataSource = {};
        (getDataSource as any).mockResolvedValue(mockDataSource);

        const { UsersService } = await import("../modules/users/users.service.js");
        const usersService = new UsersService(undefined, mockDataSource as any);
        (usersService.findByUsername as any) = mockFindByUsername;
        (usersService.createUser as any) = mockCreateUser;

        const req = {
          headers: {
            "x-ingress-path": "/api/hassio_ingress/test",
            authorization: "Bearer hass-token",
          },
        } as any;

        const result = await getUserIdFromRequest(req);
        expect(result).toBe(456);
        expect(mockFetch).toHaveBeenCalledWith("http://supervisor/auth", expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ token: "hass-token" }),
        }));
      });

      it("should return null when no token and no cookie", async () => {
        const req = {
          headers: {
            "x-ingress-path": "/api/hassio_ingress/test",
          },
        } as any;

        const result = await getUserIdFromRequest(req);
        expect(result).toBeNull();
      });

      it("should throw HassSupervisorError when supervisor is unreachable", async () => {
        mockFetch.mockRejectedValueOnce(new Error("Network error"));

        const req = {
          headers: {
            "x-ingress-path": "/api/hassio_ingress/test",
            authorization: "Bearer hass-token",
          },
        } as any;

        await expect(getUserIdFromRequest(req)).rejects.toThrow(HassSupervisorError);
      });

      it("should return null when supervisor auth fails with 401", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 401,
        });

        const req = {
          headers: {
            "x-ingress-path": "/api/hassio_ingress/test",
            authorization: "Bearer invalid-hass-token",
          },
        } as any;

        const result = await getUserIdFromRequest(req);
        expect(result).toBeNull();
      });
    });

    describe("non-HASS mode", () => {
      it("should return userId from cookie", async () => {
        const req = {
          headers: {
            cookie: "txls_auth=valid-token",
          },
        } as any;

        const result = await getUserIdFromRequest(req);
        expect(result).toBe(123);
      });

      it("should return null when no cookie", async () => {
        const req = { headers: {} } as any;
        const result = await getUserIdFromRequest(req);
        expect(result).toBeNull();
      });
    });
  });
});
