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

const mockFindByUsername = vi.fn();
const mockCreateUser = vi.fn();

vi.mock("../di/service-locator.js", () => ({
  getUsersService: () => ({
    findByUsername: mockFindByUsername,
    createUser: mockCreateUser,
  }),
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

        const mockDataSource = {};
        (getDataSource as any).mockResolvedValue(mockDataSource);
        mockFindByUsername.mockResolvedValue(mockUserEntity);

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

      it("should use x-remote-user-id header when present", async () => {
        const mockUserEntity = { id: 789, username: "hassuser123", name: "hassuser123", email: "hassuser123@hass.local", password: "hash", salt: "", isAdmin: false };
        
        const mockDataSource = {};
        (getDataSource as any).mockResolvedValue(mockDataSource);
        mockFindByUsername.mockResolvedValue(mockUserEntity);

        const req = {
          headers: {
            "x-ingress-path": "/api/hassio_ingress/test",
            "x-remote-user-id": "hassuser123",
          },
        } as any;

        const result = await getUserIdFromRequest(req);
        expect(result).toBe(789);
        expect(mockFindByUsername).toHaveBeenCalledWith("hassuser123");
      });

      it("should use x-remote-user-name header when present", async () => {
        const mockUserEntity = { id: 890, username: "remoteuser", name: "remoteuser", email: "remoteuser@hass.local", password: "hash", salt: "", isAdmin: false };
        
        const mockDataSource = {};
        (getDataSource as any).mockResolvedValue(mockDataSource);
        mockFindByUsername.mockResolvedValue(mockUserEntity);

        const req = {
          headers: {
            "x-ingress-path": "/api/hassio_ingress/test",
            "x-remote-user-name": "remoteuser",
          },
        } as any;

        const result = await getUserIdFromRequest(req);
        expect(result).toBe(890);
        expect(mockFindByUsername).toHaveBeenCalledWith("remoteuser");
      });

      it("should prefer x-remote-user-name over x-remote-user-id", async () => {
        const mockUserEntity = { id: 999, username: "preferreduser", name: "preferreduser", email: "preferreduser@hass.local", password: "hash", salt: "", isAdmin: false };
        
        const mockDataSource = {};
        (getDataSource as any).mockResolvedValue(mockDataSource);
        mockFindByUsername.mockResolvedValue(mockUserEntity);

        const req = {
          headers: {
            "x-ingress-path": "/api/hassio_ingress/test",
            "x-remote-user-id": "hassuser",
            "x-remote-user-name": "preferreduser",
          },
        } as any;

        const result = await getUserIdFromRequest(req);
        expect(result).toBe(999);
        expect(mockFindByUsername).toHaveBeenCalledWith("preferreduser");
      });

      it("should use x-remote-user-display-name as fallback", async () => {
        const mockUserEntity = { id: 111, username: "Display Name", name: "Display Name", email: "display.name@hass.local", password: "hash", salt: "", isAdmin: false };
        
        const mockDataSource = {};
        (getDataSource as any).mockResolvedValue(mockDataSource);
        mockFindByUsername.mockResolvedValue(mockUserEntity);

        const req = {
          headers: {
            "x-ingress-path": "/api/hassio_ingress/test",
            "x-remote-user-display-name": "Display Name",
          },
        } as any;

        const result = await getUserIdFromRequest(req);
        expect(result).toBe(111);
        expect(mockFindByUsername).toHaveBeenCalledWith("Display Name");
      });

      it("should create user from HASS header if not exists", async () => {
        const mockUserEntity = { id: 222, username: "newhassuser", name: "newhassuser", email: "newhassuser@hass.local", password: "hash", salt: "", isAdmin: false };
        
        const mockDataSource = {};
        (getDataSource as any).mockResolvedValue(mockDataSource);
        mockFindByUsername.mockResolvedValue(null);
        mockCreateUser.mockResolvedValue(mockUserEntity);

        const req = {
          headers: {
            "x-ingress-path": "/api/hassio_ingress/test",
            "x-remote-user-id": "newhassuser",
          },
        } as any;

        const result = await getUserIdFromRequest(req);
        expect(result).toBe(222);
        expect(mockCreateUser).toHaveBeenCalledWith(expect.objectContaining({
          username: "newhassuser",
          isAdmin: false,
        }));
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
