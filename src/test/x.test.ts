import { describe, expect, it } from "vitest";
import { oauthHeader, pct, rejectPost, xLength } from "../../supabase/functions/_shared/x";

describe("X posting helper", () => {
  it("signs a request the way X's own worked example does", async () => {
    const keys = { apiKey: "xvz1evFS4wEEPTGEFPHBog", apiSecret: "kAcSOqF21Fu85e7zjz7ZN2U4ZRhfV3WpwPAoE3Z7kBw", accessToken: "370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb", accessSecret: "LswwdoUaIvS8ltyTt5jkRh4J50vUPVVHtR2YPi5kE" };
    const h = await oauthHeader("POST", "https://api.twitter.com/1.1/statuses/update.json", keys,
      { include_entities: "true", status: "Hello Ladies + Gentlemen, a signed OAuth request!" }, "kYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg", "1318622958");
    expect(decodeURIComponent(h.match(/oauth_signature="([^"]+)"/)![1])).toBe("hCtSmYh+iHYCEqBWrE7C7hYmtUk=");
  });
  it("percent-encodes for OAuth and counts links as 23 characters", () => {
    expect(pct("Ladies + Gentlemen!")).toBe("Ladies%20%2B%20Gentlemen%21");
    expect(xLength("abc https://thegppulse.com/x/y/z?long=1")).toBe(27);
  });
  it("holds posts to the rules", () => {
    expect(rejectPost("Falfurrias took a majority stake in a Denver marketing firm founded in 2024. No press release.")).toBeNull();
    expect(rejectPost("Golub Capital BDC listed five new borrowers this quarter, spreads 4.75 to 5.25 percent.")).toBe("names a BDC");
    expect(rejectPost("x".repeat(300))).toBe("too long");
    expect(rejectPost("Eleven of 135 deals in our tracker had no press release. #privateequity #pe")).toBe("more than one hashtag");
    expect(rejectPost("Big week for add-ons, thanks @someone for the tip on the Midwest towing roll-up deals.")).toBe("mentions an account");
  });
});
