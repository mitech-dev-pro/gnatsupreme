import type { NextFunction, Request, Response } from "express";

// CSRF mitigation for cookie-authenticated endpoints that take no other proof of same-origin
// intent (/refresh rotates a session purely off its httpOnly cookie). A classic cross-site
// <form> POST or a credentialed fetch sent with no custom headers is a "simple" request under
// CORS, so it's dispatched (and its cookie attached) without a preflight even though our CORS
// config would reject the response -- the browser still applies any Set-Cookie it gets back.
// Requiring this header forces a preflight, which the exact-origin CORS policy then blocks for
// any origin other than our own frontend, so the forged request never reaches here at all.
export function requireXhrHeader(request: Request, response: Response, next: NextFunction) {
  if (request.get("x-requested-with") !== "XMLHttpRequest") {
    response.status(403).json({ success: false, message: "Request rejected" });
    return;
  }
  next();
}
