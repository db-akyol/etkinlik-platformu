import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Two jobs:
//
// 1. "/?kategori=<slug>" is where category filters used to live; it now
//    308s to the category's own page, /kategori/<slug>, keeping the other
//    filters. The home page can't do this itself with a real status code:
//    it streams behind a loading state, so by the time it runs the 200 is
//    already sent and redirect() degrades to a <meta http-equiv="refresh">.
//
// 2. Protects /admin/* routes. Now that public visitors can also have
//    accounts (for favoriting), "has a session" is no longer enough — only
//    users listed in the admin_users table may enter. See
//    supabase/migrations/0002_*.sql.
export async function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === "/") {
    const slug = request.nextUrl.searchParams.get("kategori");
    if (!slug) return NextResponse.next();
    const url = request.nextUrl.clone();
    url.pathname = `/kategori/${encodeURIComponent(slug)}`;
    url.searchParams.delete("kategori");
    return NextResponse.redirect(url, 308);
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: getUser() revalidates the session against Supabase Auth and
  // must be called before any decision is made — do not remove it.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isLoginPage = pathname === "/admin/login";

  if (!user && !isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin/login";
    return NextResponse.redirect(url);
  }

  let isAdmin = false;
  if (user) {
    const { data } = await supabase
      .from("admin_users")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();
    isAdmin = data != null;
  }

  // A logged-in user who isn't the admin (e.g. a visitor account created for
  // favoriting) gets bounced to the public homepage rather than the admin.
  if (user && !isAdmin) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (user && isAdmin && isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/", "/admin/:path*"],
};
