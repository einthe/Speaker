import { test, expect, type Page } from "@playwright/test";
import { login, provision } from "./support";
import AxeBuilder from "@axe-core/playwright";

async function giphy(page: Page) {
  const searches: string[] = [];
  await page.route("https://api.giphy.com/v1/gifs**", async (route) => {
    const url = new URL(route.request().url());
    const query = url.searchParams.get("q");
    if (query !== null) searches.push(query);
    if (query === "outage") return route.fulfill({ status: 429, json: {} });
    const ids =
      url.searchParams.get("ids")?.split(",") ??
      (query === "empty"
        ? []
        : [Number(url.searchParams.get("offset")) ? "secondGif" : "firstGif"]);
    return route.fulfill({
      json: {
        data: ids.map((id) => ({
          id,
          title: id === "firstGif" ? "Volleyball celebration" : "Team meme",
          images: {
            fixed_width: { url: `https://media.giphy.com/media/${id}/200w.gif?cid=keepme` },
            fixed_width_still: { url: `https://media.giphy.com/media/${id}/200w_s.gif?cid=keepme` },
          },
        })),
        pagination: {
          offset: Number(url.searchParams.get("offset")),
          count: ids.length,
          total_count: query === "empty" ? 0 : 21,
        },
      },
    });
  });
  await page.route("https://media.giphy.com/**", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300"><rect width="200" height="300" fill="#34607a"/><rect y="260" width="200" height="40" fill="#e7a64c"/></svg>',
    }),
  );
  return searches;
}
async function newPost(page: Page, name: string) {
  await page.goto("/posts/new");
  await page.getByLabel("Tittel", { exact: true }).fill(`Diskusjon ${name}`);
  await page.getByLabel("Innlegg", { exact: true }).fill("Et innlegg med diskusjon.");
  await page.getByRole("button", { name: "Publiser innlegg", exact: true }).click();
  await expect(page.getByRole("heading", { name: `Diskusjon ${name}`, exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Skriv kommentar", exact: true })).toBeVisible();
  return page.url();
}

test("feed cards expand comments and reactions independently of opening the post", async ({
  page,
}, info) => {
  test.skip(!process.env.E2E_LOCAL_ADAPTER, "Uses an isolated fake browser API key");
  await giphy(page);
  const account = await provision("player");
  await login(page, account);
  const firstUrl = await newPost(page, account.name);
  await page.getByRole("button", { name: "Skriv kommentar", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Kommenter innlegget", exact: true })
    .fill("Eksisterende kommentar");
  await page.getByRole("button", { name: "Publiser kommentar", exact: true }).click();
  await expect(page.getByText("Eksisterende kommentar", { exact: true })).toBeVisible();
  await newPost(page, `${account.name} andre`);
  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/team/discussion?")) requests.push(request.url());
  });
  await page.goto("/feed");
  const card = page
    .locator(".post-card")
    .filter({ has: page.getByRole("heading", { name: `Diskusjon ${account.name}`, exact: true }) });
  const second = page.locator(".post-card").filter({
    has: page.getByRole("heading", { name: `Diskusjon ${account.name} andre`, exact: true }),
  });
  await expect(card).toBeVisible();
  await expect(card.getByText("1 kommentar", { exact: true })).toBeVisible();
  expect(requests).toHaveLength(0);
  await expect(card.getByRole("link", { name: "Se innlegg" })).toHaveCount(0);
  await card.getByRole("button", { name: "Vis kommentarer", exact: true }).click();
  await expect(page).toHaveURL(/\/feed$/);
  await expect(card.getByText("Eksisterende kommentar", { exact: true })).toBeVisible();
  await expect(card.getByRole("textbox", { name: "Kommenter innlegget" })).toHaveCount(0);
  await card.getByRole("button", { name: "Skriv kommentar", exact: true }).click();
  await card
    .getByRole("textbox", { name: "Kommenter innlegget", exact: true })
    .fill("Skrevet fra feeden");
  await card.getByRole("button", { name: "Publiser kommentar", exact: true }).click();
  await expect(card.getByText("Skrevet fra feeden", { exact: true })).toBeVisible();
  await expect(card.getByRole("textbox", { name: "Kommenter innlegget" })).toHaveCount(0);
  await expect(card.getByRole("button", { name: "Skriv kommentar", exact: true })).toBeFocused();
  await expect(card.getByText("2 kommentarer", { exact: true })).toBeVisible();
  const root = card.locator(".comment-threads > li > article").first();
  await root.getByRole("button", { name: "Svar", exact: true }).click();
  await root
    .getByRole("textbox", { name: `Svar til ${account.name}`, exact: true })
    .fill("Svar fra feeden");
  await root.getByRole("button", { name: "Publiser svar", exact: true }).click();
  await expect(card.getByText("Svar fra feeden", { exact: true })).toBeVisible();
  await second.getByRole("button", { name: "Vis kommentarer", exact: true }).click();
  await expect(second.getByRole("button", { name: "Skriv kommentar", exact: true })).toBeVisible();
  await expect(second.getByRole("textbox", { name: "Kommenter innlegget" })).toHaveCount(0);
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations,
  ).toEqual([]);
  await card.getByRole("button", { name: "Vis reaksjoner", exact: true }).click();
  await expect(card.getByRole("textbox", { name: "Kommenter innlegget" })).toHaveCount(0);
  await card.getByRole("button", { name: "Reager med et meme", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "Velg et meme" });
  await picker.getByRole("button", { name: "Reager med Volleyball celebration" }).click();
  await expect(card.getByText("1 reaksjon", { exact: true })).toBeVisible();
  await expect(
    card.locator(".reaction-people").getByText(account.name, { exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/feed$/);
  await card.screenshot({ path: info.outputPath("feed-reactions.png") });
  await card.getByRole("button", { name: "Skjul reaksjoner", exact: true }).click();
  await expect(card.locator(".reaction-gallery img")).toHaveCount(0);
  // Selecting text must not navigate, while a normal body click opens the post.
  await card
    .locator(".post-body")
    .first()
    .evaluate((node) => {
      const range = document.createRange();
      range.selectNodeContents(node);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      node.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
  await expect(page).toHaveURL(/\/feed$/);
  await page.evaluate(() => window.getSelection()?.removeAllRanges());
  await card.locator(".post-body").first().click();
  await expect(page).toHaveURL(firstUrl);
  await expect(page.getByText("Svar fra feeden", { exact: true })).toBeVisible();
});

test("post comments support replies, editing, links, deletion and persistent thread context", async ({
  page,
}) => {
  const account = await provision("player");
  await login(page, account);
  await expect(page.getByRole("button", { name: "Publiser kommentar" })).toHaveCount(0);
  const url = await newPost(page, account.name);
  await page.getByRole("link", { name: "Tilbake til innlegg", exact: true }).click();
  const card = page
    .locator(".post-card")
    .filter({ has: page.getByRole("heading", { name: `Diskusjon ${account.name}`, exact: true }) });
  await expect(card).toBeVisible();
  await expect(card.locator(".discussion-counts")).toHaveCount(0);
  await card.getByRole("link", { name: `Diskusjon ${account.name}`, exact: true }).click();
  await page.getByRole("button", { name: "Skriv kommentar", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Kommenter innlegget", exact: true })
    .fill("Første kommentar https://example.com/info");
  await page.getByRole("button", { name: "Publiser kommentar" }).click();
  const roots = page.locator(".comment-threads > .comment-thread");
  await expect(roots).toHaveCount(1);
  await page.getByRole("link", { name: "Tilbake til innlegg", exact: true }).click();
  await expect(card.getByText("1 kommentar", { exact: true })).toBeVisible();
  await card.getByRole("link", { name: `Diskusjon ${account.name}`, exact: true }).click();
  const root = roots.first().locator(":scope > article");
  await expect(root.getByRole("link", { name: "https://example.com/info" })).toHaveAttribute(
    "href",
    "https://example.com/info",
  );
  await expect(root.getByText("Svar til innlegget", { exact: true })).toHaveCount(0);
  await root.getByRole("button", { name: "Svar", exact: true }).click();
  await root
    .getByRole("textbox", { name: `Svar til ${account.name}`, exact: true })
    .fill("Et svar på kommentaren");
  await root.getByRole("button", { name: "Publiser svar" }).click();
  const reply = roots.first().locator(":scope > .comment-replies > li > article").first();
  await expect(reply.getByText("Et svar på kommentaren", { exact: true })).toBeVisible();
  await expect(
    reply.getByRole("link", { name: `Svar til ${account.name}`, exact: true }),
  ).toHaveCount(0);
  await reply.getByRole("button", { name: "Svar", exact: true }).click();
  await reply
    .getByRole("textbox", { name: `Svar til ${account.name}`, exact: true })
    .fill("Et nøstet svar");
  await reply.getByRole("button", { name: "Publiser svar" }).click();
  await expect(page.getByText("Et nøstet svar", { exact: true })).toBeVisible();
  await expect(page.locator(".comment-replies").first()).toHaveCSS("border-left-width", "2px");
  await root.getByRole("button", { name: "Rediger kommentar", exact: true }).click();
  await root
    .getByRole("textbox", { name: "Rediger kommentaren", exact: true })
    .fill("Oppdatert kommentar");
  await root.getByRole("button", { name: "Lagre kommentar" }).click();
  await expect(root.getByText("Oppdatert kommentar", { exact: true })).toBeVisible();
  await root.getByRole("button", { name: "Slett kommentar", exact: true }).click();
  await root.getByRole("button", { name: "Bekreft sletting", exact: true }).click();
  await expect(root.getByText("Kommentaren er slettet.", { exact: true })).toBeVisible();
  await expect(page.getByText("Et nøstet svar", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("Et nøstet svar", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("link", { name: "Tilbake til innlegg", exact: true }).click();
  await expect(card.getByText("2 kommentarer", { exact: true })).toBeVisible();
  await expect(card.locator(".meme-count")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Reager med et meme" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Publiser kommentar" })).toHaveCount(0);
  await page.goto(url);
  await expect(page.getByText("Kommentaren er slettet.", { exact: true })).toBeVisible();
});

test("meme replies are threaded, answerable and only hide with all comments", async ({
  page,
}, info) => {
  test.skip(!process.env.E2E_LOCAL_ADAPTER, "Uses an isolated fake browser API key");
  await giphy(page);
  const account = await provision("player");
  await login(page, account);
  const url = await newPost(page, account.name);
  await page.getByRole("button", { name: "Skriv kommentar", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Kommenter innlegget", exact: true })
    .fill("En kommentar med memesvar");
  await page.getByRole("button", { name: "Publiser kommentar", exact: true }).click();
  const root = page.locator("article.comment").filter({ hasText: "En kommentar med memesvar" });
  const answer = root.getByRole("button", { name: "Svar", exact: true });
  const react = root.getByRole("button", { name: "Reager", exact: true });
  expect(Math.abs((await answer.boundingBox())!.y - (await react.boundingBox())!.y)).toBeLessThan(
    2,
  );
  await react.click();
  const picker = page.getByRole("dialog", { name: "Velg et meme" });
  await picker
    .getByRole("button", { name: "Reager med Volleyball celebration", exact: true })
    .click();
  const meme = page
    .locator(".comment-replies > li > article")
    .filter({ has: page.locator(".comment-meme") })
    .first();
  await expect(meme.locator(".comment-meme img")).toBeVisible();
  const frame = meme.locator(".meme-image-frame");
  await expect(frame).toHaveAttribute("data-state", "loaded");
  const imageBounds = (await frame.locator("img").boundingBox())!;
  const frameBounds = (await frame.boundingBox())!;
  expect(imageBounds.height / imageBounds.width).toBeCloseTo(1.5, 1);
  expect(frameBounds.height).toBeGreaterThanOrEqual(imageBounds.height - 1);
  await expect(meme.locator(".comment-context")).toHaveCount(0);
  await expect(meme.locator(".comment-header")).toContainText(account.name);
  await expect(
    page.locator(".discussion-comments").getByRole("button", { name: /Skjul reaksjoner/ }),
  ).toHaveCount(0);
  await meme.getByRole("button", { name: "Svar", exact: true }).click();
  await meme
    .getByRole("textbox", { name: `Svar til ${account.name}`, exact: true })
    .fill("Svar på memet");
  await meme.getByRole("button", { name: "Publiser svar", exact: true }).click();
  await meme.getByRole("button", { name: "Reager", exact: true }).click();
  await picker
    .getByRole("button", { name: "Reager med Volleyball celebration", exact: true })
    .click();
  await expect(page.locator(".comment-meme")).toHaveCount(2);
  await expect(page.getByText("Svar på memet", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator(".comment-meme")).toHaveCount(2);
  await page.getByRole("button", { name: "Skjul alle kommentarer", exact: true }).click();
  await expect(page.locator(".comment-meme")).toHaveCount(0);
  await page.getByRole("button", { name: "Vis alle kommentarer", exact: true }).click();
  await expect(page.locator(".comment-meme")).toHaveCount(2);
  await expect(page.locator(".discussion > .discussion-reactions .meme-reaction")).toHaveCount(0);
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations,
  ).toEqual([]);
  await page.goto("/feed");
  const card = page
    .locator(".post-card")
    .filter({ has: page.getByRole("heading", { name: `Diskusjon ${account.name}`, exact: true }) });
  await card.getByRole("button", { name: "Vis kommentarer", exact: true }).click();
  await expect(card.locator(".comment-meme")).toHaveCount(2);
  await expect(card.locator(".meme-count")).toHaveCount(0);
  await card.screenshot({ path: info.outputPath("threaded-memes.png") });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto(url);
  await meme.getByRole("button", { name: "Slett reaksjon", exact: true }).click();
  await meme.getByRole("button", { name: "Bekreft sletting", exact: true }).click();
  await expect(page.locator(".comment-meme")).toHaveCount(1);
  await expect(page.getByText("Svar på memet", { exact: true })).toBeVisible();
  await expect(page.getByText("Kommentaren er slettet.", { exact: true })).toBeVisible();
});

test("Giphy search, pagination, error recovery, reaction counts and removal work on post details", async ({
  page,
  browser,
}) => {
  test.skip(!process.env.E2E_LOCAL_ADAPTER, "Uses an isolated fake browser API key");
  const searches = await giphy(page);
  const account = await provision("player");
  await login(page, account);
  const url = await newPost(page, account.name);
  const launch = page.getByRole("button", { name: "Reager med et meme" });
  await launch.click();
  const picker = page.getByRole("dialog", { name: "Velg et meme" });
  await expect(picker.getByLabel("Søk etter memes")).toBeFocused();
  await expect(picker.getByLabel("Spill av GIF-er")).toHaveCount(0);
  await expect(picker.locator(".meme-choice img").first()).toHaveAttribute(
    "src",
    /200w.gif\?cid=keepme$/,
  );
  await expect(picker.locator(".giphy-attribution img")).toHaveCount(0);
  await picker.getByLabel("Søk etter memes").fill("volleyball & team");
  await picker.getByRole("button", { name: "Søk", exact: true }).click();
  await expect(
    picker.getByRole("button", { name: "Reager med Volleyball celebration" }),
  ).toBeVisible();
  expect(searches).toContain("volleyball & team");
  await picker.getByRole("button", { name: "Neste", exact: true }).click();
  await expect(picker.getByRole("button", { name: "Reager med Team meme" })).toBeVisible();
  await picker.getByLabel("Søk etter memes").fill("outage");
  await picker.getByRole("button", { name: "Søk", exact: true }).click();
  await expect(picker.getByRole("alert")).toContainText("søkegrensen");
  await picker.getByLabel("Søk etter memes").fill("empty");
  await picker.getByRole("button", { name: "Søk", exact: true }).click();
  await expect(picker.getByText("Ingen memes funnet. Prøv et annet søk.")).toBeVisible();
  await picker.getByLabel("Søk etter memes").fill("memes");
  await picker.getByRole("button", { name: "Søk", exact: true }).click();
  await picker.getByRole("button", { name: "Reager med Volleyball celebration" }).click();
  await expect(picker).not.toBeVisible();
  const reaction = page.getByRole("button", {
    name: "Fjern reaksjon: Volleyball celebration (1)",
    exact: true,
  });
  await expect(reaction).toHaveAttribute("aria-pressed", "true");
  await expect(reaction.locator("img")).toHaveAttribute("src", /200w.gif\?cid=keepme$/);
  await expect(page.getByLabel("Spill av GIF-er")).toHaveCount(0);
  await expect(
    page.locator(".reaction-people").getByText(account.name, { exact: true }),
  ).toBeVisible();
  await expect(page.locator("details.reaction-people")).toHaveCount(0);
  const hide = page.getByRole("button", { name: "Skjul reaksjoner", exact: true });
  await expect(hide).toHaveAttribute("aria-expanded", "true");
  await hide.click();
  await expect(page.locator(".reaction-gallery img")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Skriv kommentar", exact: true })).toBeVisible();
  const show = page.getByRole("button", { name: "Vis reaksjoner", exact: true });
  await expect(show).toHaveAttribute("aria-expanded", "false");
  await show.click();
  await expect(reaction.locator("img")).toHaveAttribute("src", /200w.gif\?cid=keepme$/);
  await expect(
    page.locator(".reaction-people").getByText(account.name, { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(reaction).toBeVisible();

  const other = await provision("coach");
  const otherContext = await browser.newContext();
  const otherPage = await otherContext.newPage();
  await giphy(otherPage);
  await login(otherPage, other);
  await otherPage.goto(url);
  await otherPage
    .getByRole("button", { name: "Legg til reaksjon: Volleyball celebration (1)" })
    .click();
  await expect(
    otherPage.getByRole("button", { name: "Fjern reaksjon: Volleyball celebration (2)" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.locator(".reaction-people").getByText(account.name, { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".reaction-people").getByText(other.name, { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Fjern reaksjon: Volleyball celebration (2)" }).click();
  await expect(
    page.getByRole("button", { name: "Legg til reaksjon: Volleyball celebration (1)" }),
  ).toHaveAttribute("aria-pressed", "false");
  await otherContext.close();
  await launch.click();
  await page.keyboard.press("Escape");
  await expect(picker).not.toBeVisible();
  await expect(launch).toBeFocused();
  await page.getByRole("link", { name: "Tilbake til innlegg", exact: true }).click();
  const card = page
    .locator(".post-card")
    .filter({ has: page.getByRole("heading", { name: `Diskusjon ${account.name}`, exact: true }) });
  await expect(card.getByText("1 reaksjon", { exact: true })).toBeVisible();
  await expect(card.locator(".comment-count")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("ordinary members can discuss events, cannot moderate others, and comments survive Giphy failures", async ({
  page,
  browser,
}) => {
  test.skip(!process.env.E2E_LOCAL_ADAPTER, "Uses an isolated fake browser API key");
  await giphy(page);
  const coach = await provision("coach");
  await login(page, coach);
  await page.goto("/schedule/new");
  await page.getByLabel("Type hendelse").selectOption("practice");
  const title = `Kommentarer ${coach.name}`;
  await page.getByLabel("Tittel", { exact: true }).fill(title);
  await page.getByLabel("Starter", { exact: true }).fill("2030-04-05T18:00");
  await page.getByRole("button", { name: "Opprett hendelse", exact: true }).click();
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  const url = page.url();
  await page.getByRole("button", { name: "Skriv kommentar", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Kommenter hendelsen", exact: true })
    .fill("Trenerens kommentar");
  await page.getByRole("button", { name: "Publiser kommentar" }).click();
  await expect(page.getByText("Trenerens kommentar", { exact: true })).toBeVisible();
  const member = await provision("player");
  const memberContext = await browser.newContext();
  const memberPage = await memberContext.newPage();
  await giphy(memberPage);
  await login(memberPage, member);
  await memberPage.goto(url);
  const coachComment = memberPage
    .locator("article.comment")
    .filter({ hasText: "Trenerens kommentar" });
  await expect(coachComment.getByRole("button", { name: "Rediger kommentar" })).toHaveCount(0);
  await expect(coachComment.getByRole("button", { name: "Slett kommentar" })).toHaveCount(0);
  await coachComment.getByRole("button", { name: "Reager", exact: true }).click();
  await memberPage
    .getByRole("dialog", { name: "Velg et meme" })
    .getByRole("button", { name: "Reager med Volleyball celebration" })
    .click();
  const memeReply = memberPage
    .locator("article.comment")
    .filter({ has: memberPage.locator(".comment-meme") });
  await expect(memeReply.locator(".comment-header")).toContainText(member.name);
  await memeReply.getByRole("button", { name: "Slett reaksjon", exact: true }).click();
  await memeReply.getByRole("button", { name: "Bekreft sletting", exact: true }).click();
  await expect(memberPage.locator(".comment-meme")).toHaveCount(0);
  await expect(memberPage.getByText("Kommentaren er slettet.", { exact: true })).toHaveCount(0);
  await expect(memberPage.locator(".comment-replies > li")).toHaveCount(0);
  await memberPage.reload();
  await expect(coachComment).toBeVisible();
  await expect(memberPage.locator(".comment-replies > li")).toHaveCount(0);
  await coachComment.getByRole("button", { name: "Svar", exact: true }).click();
  await coachComment
    .getByRole("textbox", { name: `Svar til ${coach.name}`, exact: true })
    .fill("Spillerens svar");
  await coachComment.getByRole("button", { name: "Publiser svar" }).click();
  await expect(memberPage.getByText("Spillerens svar", { exact: true })).toBeVisible();
  await memberPage.getByRole("button", { name: "Reager med et meme" }).click();
  await memberPage.getByRole("button", { name: "Reager med Volleyball celebration" }).click();
  await expect(
    memberPage.getByRole("button", { name: "Fjern reaksjon: Volleyball celebration (1)" }),
  ).toBeVisible();
  await memberPage.route("https://api.giphy.com/v1/gifs**", (route) => route.abort());
  await memberPage.reload();
  await expect(memberPage.getByText("Reaksjonsbildene kunne ikke hentes.")).toBeVisible();
  await memberPage.getByRole("button", { name: "Skriv kommentar", exact: true }).click();
  await memberPage
    .getByRole("textbox", { name: "Kommenter hendelsen", exact: true })
    .fill("Kommentar uten Giphy");
  await memberPage.getByRole("button", { name: "Publiser kommentar" }).click();
  await expect(memberPage.getByText("Kommentar uten Giphy", { exact: true })).toBeVisible();
  await memberContext.close();
  await page.getByRole("link", { name: "Tilbake til terminlisten", exact: true }).click();
  const eventCard = page
    .locator(".event-card")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) });
  await expect(eventCard.getByText("3 kommentarer", { exact: true })).toBeVisible();
  await expect(eventCard.getByText("1 reaksjon", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByRole("button", { name: "Reager med et meme" })).toHaveCount(0);
});
