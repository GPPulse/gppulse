import { describe, expect, it } from "vitest";
import { mayAutoConfirm } from "../../supabase/functions/inbound-email/confirm";

describe("mayAutoConfirm", () => {
  it("opens links at mailing-list services", () => {
    expect(mayAutoConfirm("https://acme.us5.list-manage.com/subscribe/confirm?u=a&id=b&e=c", null)).toBe(true);
    expect(mayAutoConfirm("https://1234.hubspotemail.net/hs/manage-preferences/confirm?x=1", null)).toBe(false); // preferences link
    expect(mayAutoConfirm("https://visitor.constantcontact.com/do?p=oo&m=1&confirm=1", null)).toBe(true);
  });
  it("opens links on the firm's own site, and only that firm's", () => {
    expect(mayAutoConfirm("https://www.huroncapital.com/?na=c&nk=123-abc", "huroncapital.com")).toBe(true);
    expect(mayAutoConfirm("https://news.huroncapital.com/confirm/abc", "www.huroncapital.com")).toBe(true);
    expect(mayAutoConfirm("https://huroncapital.com.evil.example/confirm", "huroncapital.com")).toBe(false);
    expect(mayAutoConfirm("https://somewhere-else.com/confirm/abc", "huroncapital.com")).toBe(false);
    expect(mayAutoConfirm("https://somewhere-else.com/confirm/abc", null)).toBe(false);
  });
  it("never opens plain http, bare IPs, local hosts or unsubscribe links", () => {
    expect(mayAutoConfirm("http://acme.list-manage.com/subscribe/confirm?u=a", null)).toBe(false);
    expect(mayAutoConfirm("https://10.0.0.5/confirm", null)).toBe(false);
    expect(mayAutoConfirm("https://localhost/confirm", null)).toBe(false);
    expect(mayAutoConfirm("https://acme.list-manage.com/unsubscribe?u=a&id=b", null)).toBe(false);
    expect(mayAutoConfirm("not a url", null)).toBe(false);
  });
});
