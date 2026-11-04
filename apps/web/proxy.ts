import { authkitProxy } from "@workos-inc/authkit-nextjs";
import {
  NextResponse,
  type NextFetchEvent,
  type NextRequest,
} from "next/server";
import { authConfigured } from "@/lib/auth-config";
const workosProxy = authkitProxy();
export default function proxy(request: NextRequest, event: NextFetchEvent) {
  // This server-to-server endpoint authenticates its own integration credential.
  if (request.nextUrl.pathname === "/api/integrations/enquiries")
    return NextResponse.next();
  if (!authConfigured()) return NextResponse.next();
  return workosProxy(request, event);
}
export const config = {
  matcher: [
    "/",
    "/login",
    "/quotations/:path*",
    "/sign-in/:path*",
    "/account/:path*",
    "/callback",
    "/access-denied",
    "/admin/:path*",
    "/api/:path*",
  ],
};
