import { describe, it, expect } from "vitest";
import {
  isBlockedStyleDeclaration,
  removeBlockedStyleDeclarations,
  sanitizeReadmeHtml,
} from "@/lib/readme-sanitize";

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
