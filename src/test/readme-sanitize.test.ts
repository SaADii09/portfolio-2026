import { describe, it, expect } from "vitest";
import {
  isBlockedStyleDeclaration,
  removeBlockedStyleDeclarations,
  sanitizeReadmeHtml,
} from "@/lib/readme-sanitize";

/**
 * Parses HTML the way a browser would, so assertions describe the LIVE DOM.
 * A substring check on the sanitized string is not enough: an attribute the
 * transform misses becomes a live event handler the moment the browser
 * re-parses the markup.
 */
function parseHtml(html: string): HTMLElement {
  const host = document.createElement("div");
  host.innerHTML = html;
  return host;
}

describe("sanitizeReadmeHtml — blocked element removal", () => {
  it("removes <script> with its contents", () => {
    expect(sanitizeReadmeHtml('<p>hi</p><script>alert("x")</script>')).toBe("<p>hi</p>");
  });

  it("removes <iframe> with its contents", () => {
    expect(sanitizeReadmeHtml('<iframe src="https://evil.example"><p>inner</p></iframe>ok')).toBe(
      "ok",
    );
  });

  it("removes <object> with its contents", () => {
    expect(sanitizeReadmeHtml('<object data="x.swf"><param name="a"></object>tail')).toBe("tail");
  });

  it("removes <form> with its contents", () => {
    expect(sanitizeReadmeHtml('<form action="/steal"><input name="pw"></form>keep')).toBe("keep");
  });

  it("removes void <embed> elements", () => {
    expect(sanitizeReadmeHtml('<embed src="x.swf">after')).toBe("after");
  });

  it("removes multiple blocked elements in one pass", () => {
    expect(sanitizeReadmeHtml('<script>a</script>text<embed src="y"><form><b>f</b></form>')).toBe(
      "text",
    );
  });

  it("removes uppercase block-tag variants", () => {
    const input = '<SCRIPT>alert(1)</SCRIPT><P>kept</P><EMBED src="z">';
    expect(sanitizeReadmeHtml(input)).toBe("<P>kept</P>");
  });

  it("leaves benign siblings untouched", () => {
    expect(sanitizeReadmeHtml("<ul><li>a</li><li>b</li></ul>")).toBe(
      "<ul><li>a</li><li>b</li></ul>",
    );
  });
});

describe("sanitizeReadmeHtml — style attributes", () => {
  it("drops the style attribute when every declaration is blocked, keeping the element", () => {
    expect(sanitizeReadmeHtml('<p style="color:#fff;background:url(x)">keep</p>')).toBe(
      "<p>keep</p>",
    );
  });

  it("keeps benign declarations and drops blocked ones", () => {
    expect(
      sanitizeReadmeHtml('<p style="margin:0;color:red;background-image:url(a.png)">t</p>'),
    ).toBe('<p style="margin:0">t</p>');
  });

  it("leaves style attributes without blocked declarations alone", () => {
    expect(sanitizeReadmeHtml('<p style="margin:0">t</p>')).toBe('<p style="margin:0">t</p>');
  });
});

describe("sanitizeReadmeHtml — on* attributes", () => {
  it("removes onclick", () => {
    expect(sanitizeReadmeHtml('<p onclick="boom()">t</p>')).toBe("<p>t</p>");
  });

  it("removes onerror and uppercase ONMOUSEOVER", () => {
    expect(sanitizeReadmeHtml('<img onerror="x()" ONMOUSEOVER="y()">')).toBe("<img>");
  });

  it("does not touch data- attributes or ordinary words", () => {
    expect(sanitizeReadmeHtml('<p data-onclick="x">online now</p>')).toBe(
      '<p data-onclick="x">online now</p>',
    );
  });
});

describe("sanitizeReadmeHtml — anchors", () => {
  it("adds target and rel to a plain anchor", () => {
    expect(sanitizeReadmeHtml('<a href="https://example.com">go</a>')).toBe(
      '<a href="https://example.com" target="_blank" rel="noopener noreferrer">go</a>',
    );
  });

  it("replaces an existing rel with the forced one", () => {
    expect(sanitizeReadmeHtml('<a href="a.md" rel="nofollow">go</a>')).toBe(
      '<a href="a.md" target="_blank" rel="noopener noreferrer">go</a>',
    );
  });

  it("replaces an existing target with _blank", () => {
    expect(sanitizeReadmeHtml('<a href="a.md" target="_self">go</a>')).toBe(
      '<a href="a.md" target="_blank" rel="noopener noreferrer">go</a>',
    );
  });

  it("normalizes uppercase <A> tags", () => {
    expect(sanitizeReadmeHtml('<A HREF="x.md">go</A>')).toMatch(
      /^<A HREF="x\.md" target="_blank" rel="noopener noreferrer">go<\/A>$/,
    );
  });

  it("does not add anchor attributes to non-anchors", () => {
    expect(sanitizeReadmeHtml('<p class="x">go</p>')).toBe('<p class="x">go</p>');
  });
});

describe("sanitizeReadmeHtml — pass-through", () => {
  it("returns an empty string for an empty input", () => {
    expect(sanitizeReadmeHtml("")).toBe("");
  });

  it("returns plain text untouched", () => {
    expect(sanitizeReadmeHtml("just words")).toBe("just words");
  });

  it("concatenates safe markup with nothing else", () => {
    const html = '<h1>Hi</h1><p>See <a href="a.md">doc</a></p>';
    expect(sanitizeReadmeHtml(html)).toBe(
      '<h1>Hi</h1><p>See <a href="a.md" target="_blank" rel="noopener noreferrer">doc</a></p>',
    );
  });
});

describe("task-3 review fixes", () => {
  it("finding 1: strips onload separated by / from the tag name", () => {
    expect(sanitizeReadmeHtml("<svg/onload=alert(1)>")).not.toMatch(/onload/i);
    expect(sanitizeReadmeHtml("<img/onerror=x>after")).not.toMatch(/onerror/i);
  });

  it("re-review: an unterminated tag with 60 quote chars sanitizes in bounded time", () => {
    const input = `<a ${'" '.repeat(60)}no-close`;
    const started = performance.now();
    const out = sanitizeReadmeHtml(input);
    const elapsed = performance.now() - started;
    expect(out).toContain("no-close");
    expect(elapsed).toBeLessThan(1000);
  });

  it("finding 2: quote-aware scan strips the handler after a quoted >", () => {
    const out = sanitizeReadmeHtml('<img alt="x>" onerror=y>hello');
    expect(out).not.toMatch(/onerror/i);
  });

  it("finding 2: quoted > does not truncate an anchor into broken markup", () => {
    expect(sanitizeReadmeHtml('<a target="x>y">go</a>')).toBe(
      '<a target="_blank" rel="noopener noreferrer">go</a>',
    );
  });

  it("finding 3: blocks border-color, outline-color and vendor-prefixed paint", () => {
    expect(sanitizeReadmeHtml('<p style="border-color:#fff">t</p>')).toBe("<p>t</p>");
    expect(sanitizeReadmeHtml('<p style="outline-color:red">t</p>')).toBe("<p>t</p>");
    expect(sanitizeReadmeHtml('<p style="-webkit-background-image:url(x)">t</p>')).toBe("<p>t</p>");
  });

  it("finding 3: column-count stays safe with and without a vendor prefix", () => {
    expect(sanitizeReadmeHtml('<p style="column-count:3">t</p>')).toBe(
      '<p style="column-count:3">t</p>',
    );
    expect(sanitizeReadmeHtml('<p style="-webkit-column-count:3">t</p>')).toBe(
      '<p style="-webkit-column-count:3">t</p>',
    );
  });
});

describe("blocked style declaration helpers (post-review)", () => {
  it("classifies every paint family named in the review as blocked", () => {
    expect(isBlockedStyleDeclaration("border-color:#fff")).toBe(true);
    expect(isBlockedStyleDeclaration("outline-color:red")).toBe(true);
    expect(isBlockedStyleDeclaration("-webkit-background-image:url(x)")).toBe(true);
  });

  it("keeps column-count safe with and without a vendor prefix", () => {
    expect(isBlockedStyleDeclaration("column-count:3")).toBe(false);
    expect(isBlockedStyleDeclaration("-webkit-column-count:3")).toBe(false);
  });
});

describe("review I-1 — attributes glued to a previous quoted value", () => {
  it("strips an onerror attribute that follows a double-quoted value with no separator", () => {
    const host = parseHtml(sanitizeReadmeHtml('<img alt="x"onerror=alert(1)>'));
    const img = host.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.hasAttribute("onerror")).toBe(false);
    expect(img?.getAttribute("alt")).toBe("x");
  });

  it("strips an onerror attribute that follows a single-quoted value with no separator", () => {
    const host = parseHtml(sanitizeReadmeHtml("<img alt='x'onerror=alert(1)>"));
    const img = host.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.hasAttribute("onerror")).toBe(false);
    expect(img?.getAttribute("alt")).toBe("x");
  });

  it("leaves no live handler when handlers are packed without separators", () => {
    const host = parseHtml(
      sanitizeReadmeHtml('<img alt="x"onerror=alert(1)onload=alert(2)onclick=alert(3)>'),
    );
    const img = host.querySelector("img");
    expect(img).not.toBeNull();
    for (const handler of ["onerror", "onload", "onclick"]) {
      expect(img?.hasAttribute(handler)).toBe(false);
    }
  });

  it("drops the style attribute when it follows a quoted value with no separator", () => {
    const host = parseHtml(
      sanitizeReadmeHtml('<p alt="x"style="color:red;background:url(x)">keep</p>'),
    );
    const p = host.querySelector("p");
    expect(p).not.toBeNull();
    expect(p?.getAttribute("style") ?? "").not.toMatch(/color|background/i);
    expect(p?.getAttribute("alt")).toBe("x");
    expect(p?.textContent).toBe("keep");
  });

  it("forces target=_blank when a target follows a quoted value with no separator", () => {
    const host = parseHtml(
      sanitizeReadmeHtml('<a alt="x"target="_self"href="https://example.com">go</a>'),
    );
    const a = host.querySelector("a");
    expect(a).not.toBeNull();
    expect(a?.getAttribute("target")).toBe("_blank");
    expect(a?.getAttribute("rel")).toContain("noopener");
    expect(a?.getAttribute("href")).toBe("https://example.com");
  });

  it("keeps the tag name separate from the attribute that follows a removed one", () => {
    const host = parseHtml(
      sanitizeReadmeHtml('<a href="javascript:alert(1)"target="_self">go</a>'),
    );
    const a = host.querySelector("a");
    expect(a).not.toBeNull();
    expect(a?.getAttribute("target")).toBe("_blank");
    expect(a?.textContent).toBe("go");
  });

  it("sanitizes a long run of glued attributes in bounded time", () => {
    const input = `<img ${'alt="x"onerror=y '.repeat(2000)}>`;
    const started = performance.now();
    const out = sanitizeReadmeHtml(input);
    const elapsed = performance.now() - started;
    expect(out).not.toMatch(/onerror/i);
    expect(elapsed).toBeLessThan(1000);
  });
});

describe("review I-2 — element blocklist and URL scheme validation", () => {
  it("removes a javascript: href", () => {
    const host = parseHtml(sanitizeReadmeHtml('<a href="javascript:alert(1)">go</a>'));
    const a = host.querySelector("a");
    expect(a).not.toBeNull();
    expect(a?.hasAttribute("href")).toBe(false);
    expect(a?.textContent).toBe("go");
  });

  it("removes every scheme a browser still resolves", () => {
    const payloads = [
      '<a href="JaVaScRiPt:alert(1)">x</a>',
      '<a href=" javascript:alert(1)">x</a>',
      '<a href="java\tscript:alert(1)">x</a>',
      '<a href="data:text/html;base64,PHNjcmlwdD4=">x</a>',
      '<a href="vbscript:msgbox(1)">x</a>',
      '<a href="file:///etc/passwd">x</a>',
      '<a href="javascript&#58;alert(1)">x</a>',
      '<a href="java&Tab;script:alert(1)">x</a>',
    ];
    for (const payload of payloads) {
      const a = parseHtml(sanitizeReadmeHtml(payload)).querySelector("a");
      expect(a?.hasAttribute("href")).toBe(false);
    }
  });

  it("keeps safe schemes and relative references", () => {
    const safe = [
      "https://example.com/x",
      "http://example.com/x",
      "mailto:hi@example.com",
      "tel:+15551234",
      "//cdn.example.com/x.png",
      "/root/relative",
      "#anchor",
      "docs/readme.md",
    ];
    for (const url of safe) {
      const a = parseHtml(sanitizeReadmeHtml(`<a href="${url}">x</a>`)).querySelector("a");
      expect(a?.getAttribute("href")).toBe(url);
    }
  });

  it("removes a <style> element with its contents", () => {
    const host = parseHtml(sanitizeReadmeHtml("<p>keep</p><style>body{background:red}</style>"));
    expect(host.querySelector("style")).toBeNull();
    expect(host.textContent).toBe("keep");
  });

  it("removes a remote stylesheet <link>", () => {
    const host = parseHtml(
      sanitizeReadmeHtml('<link rel="stylesheet" href="https://evil.example/x.css">keep'),
    );
    expect(host.querySelector("link")).toBeNull();
    expect(host.textContent).toBe("keep");
  });

  it("removes a <base> element that re-points relative URLs", () => {
    const host = parseHtml(sanitizeReadmeHtml('<base href="https://evil.example/">keep'));
    expect(host.querySelector("base")).toBeNull();
  });

  it("removes a <meta http-equiv=refresh> navigation hijack", () => {
    const out = sanitizeReadmeHtml(
      '<meta http-equiv="refresh" content="0;url=https://evil.example/">keep',
    );
    expect(out).not.toMatch(/<meta/i);
    expect(out).toContain("keep");
  });

  it("strips a javascript: src and an xlink:href", () => {
    const img = parseHtml(sanitizeReadmeHtml('<img src="javascript:alert(1)">')).querySelector(
      "img",
    );
    expect(img?.hasAttribute("src")).toBe(false);
    const use = parseHtml(
      sanitizeReadmeHtml('<svg><use xlink:href="javascript:alert(1)"/></svg>'),
    ).querySelector("use");
    expect(use?.hasAttribute("xlink:href")).toBe(false);
  });
});

describe("review I-1 round 2 — packed attributes and unparseable tags", () => {
  /** The number of attributes with this name on the parsed element. */
  function attributeCount(el: Element | null, name: string): number {
    if (!el) return 0;
    return Array.from(el.attributes).filter((attr) => attr.name === name).length;
  }

  it("strips a quoted handler that is packed against the previous attribute", () => {
    const host = parseHtml(sanitizeReadmeHtml('<img onerror="x"onload="alert(1)">'));
    const img = host.querySelector("img");
    expect(img?.hasAttribute("onerror") ?? false).toBe(false);
    expect(img?.hasAttribute("onload") ?? false).toBe(false);
  });

  it("strips a packed style attribute instead of leaving paint on the element", () => {
    const host = parseHtml(
      sanitizeReadmeHtml('<p style="color:red"style="background:url(x)">t</p>'),
    );
    const p = host.querySelector("p");
    expect(p).not.toBeNull();
    expect(p?.hasAttribute("style") ?? false).toBe(false);
  });

  it("keeps exactly one forced target and rel when the tag packs duplicates", () => {
    const host = parseHtml(sanitizeReadmeHtml('<a target="_self"target="_x"href="u">go</a>'));
    const a = host.querySelector("a");
    expect(a).not.toBeNull();
    expect(a?.getAttribute("target")).toBe("_blank");
    expect(a?.getAttribute("rel")).toContain("noopener");
    expect(attributeCount(a, "target")).toBe(1);
    expect(attributeCount(a, "rel")).toBe(1);
  });

  it("keeps exactly one forced rel when the tag packs duplicate rels", () => {
    const host = parseHtml(sanitizeReadmeHtml('<a rel="nofollow"rel="opener"href="u">go</a>'));
    const a = host.querySelector("a");
    expect(a).not.toBeNull();
    expect(a?.getAttribute("rel")).toBe("noopener noreferrer");
    expect(attributeCount(a, "rel")).toBe(1);
  });

  it("scheme-checks every packed href", () => {
    const host = parseHtml(
      sanitizeReadmeHtml('<a href="javascript:alert(1)"href="javascript:alert(2)">go</a>'),
    );
    const a = host.querySelector("a");
    expect(a).not.toBeNull();
    expect(a?.hasAttribute("href") ?? false).toBe(false);
    expect(attributeCount(a, "href")).toBe(0);
  });

  it("fails closed on a tag the quote-aware scanner cannot close", () => {
    const payloads = [
      '<img "x onerror=alert(1)>',
      "<img 'x onerror=alert(1)>",
      '<img x"y onerror=alert(1)>',
      '<div "x onclick=alert(1)>',
    ];
    for (const payload of payloads) {
      const host = parseHtml(sanitizeReadmeHtml(payload));
      expect(host.querySelectorAll("[onerror]").length).toBe(0);
      expect(host.querySelectorAll("[onclick]").length).toBe(0);
    }
  });

  it("keeps the text around a malformed tag", () => {
    const host = parseHtml(sanitizeReadmeHtml('before<div "x onclick=alert(1)>after'));
    expect(host.textContent).toContain("before");
    expect(host.textContent).toContain("after");
    expect(host.querySelectorAll("[onclick]").length).toBe(0);
  });
});

describe("blocked style declaration helpers", () => {
  it("classifies color and background families as blocked", () => {
    expect(isBlockedStyleDeclaration("color:#fff")).toBe(true);
    expect(isBlockedStyleDeclaration("background:url(x)")).toBe(true);
    expect(isBlockedStyleDeclaration("background-color:#fff")).toBe(true);
    expect(isBlockedStyleDeclaration("background-image:url(a.png)")).toBe(true);
  });

  it("leaves unrelated properties alone", () => {
    expect(isBlockedStyleDeclaration("margin:0")).toBe(false);
    expect(isBlockedStyleDeclaration("column-count:2")).toBe(false);
    expect(isBlockedStyleDeclaration("")).toBe(false);
  });

  it("strips blocked declarations and keeps the rest", () => {
    expect(removeBlockedStyleDeclarations("margin:0;color:red;padding:1px")).toBe(
      "margin:0;padding:1px",
    );
  });

  it("returns an empty string when everything is blocked", () => {
    expect(removeBlockedStyleDeclarations("color:#fff;background:url(x)")).toBe("");
  });
});
