import test from "node:test";
import assert from "node:assert/strict";
import { searchSberbankAstTenders } from "../src/server/sberbankAstTenderSearch.ts";

const originalFetch = globalThis.fetch;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("searchSberbankAstTenders returns 223-FZ tenders from UTP search", async () => {
  const seenUrls: string[] = [];

  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    seenUrls.push(url);

    if (url.includes("utp.sberbank-ast.ru/Trade/SearchQuery/BidList")) {
      return new Response(
        JSON.stringify({
          result: "success",
          data: {
            Data: {
              tableXml: "<datarow><hits><BidName>Поставка ноутбуков</BidName><productCodes>26.20.11.110</productCodes><productNames>Ноутбуки</productNames><objectHrefTerm>https://utp.sberbank-ast.ru/Trade/NBT/PurchaseView/22/0/0/4065372</objectHrefTerm><PublicDate>29.05.2026 11:42</PublicDate><purchAmount>1200000.00</purchAmount><purchCurrency>RUB</purchCurrency><OrgName>Заказчик 223</OrgName></hits></datarow>"
            }
          }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }

    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  const tenders = await searchSberbankAstTenders("ноутбук", 5, { law44: false, law223: true });

  assert.equal(tenders.length, 1);
  assert.equal(tenders[0]?.platform, "Сбербанк-АСТ · 223-ФЗ");
  assert.equal(tenders[0]?.okpd2, "26.20.11.110");
  assert.equal(tenders[0]?.link, "https://utp.sberbank-ast.ru/Trade/NBT/PurchaseView/22/0/0/4065372");
  assert.deepEqual(seenUrls, ["https://utp.sberbank-ast.ru/Trade/SearchQuery/BidList"]);
});

test("searchSberbankAstTenders queries 44-FZ and 223-FZ sources in parallel when both laws are selected", async () => {
  const seenUrls: string[] = [];

  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    seenUrls.push(url);

    if (url.includes("www.sberbank-ast.ru/SearchQuery.aspx?name=Main")) {
      return new Response(
        JSON.stringify({
          result: "success",
          data: JSON.stringify({
            tableXml: "<datarow><hits><BidName>Поставка МФУ</BidName><productCodes>26.20.18.110</productCodes><productNames>МФУ</productNames><objectHrefTerm>https://www.sberbank-ast.ru/purchaseView.aspx?id=1</objectHrefTerm><PublicDate>10.06.2026 15:17</PublicDate><purchAmount>84950.00</purchAmount><purchCurrency>RUB</purchCurrency></hits></datarow>"
          })
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }

    if (url.includes("utp.sberbank-ast.ru/Trade/SearchQuery/BidList")) {
      return new Response(
        JSON.stringify({
          result: "success",
          data: {
            Data: {
              tableXml: "<datarow><hits><BidName>Поставка ноутбуков</BidName><productCodes>26.20.11.110</productCodes><productNames>Ноутбуки</productNames><objectHrefTerm>https://utp.sberbank-ast.ru/Trade/NBT/PurchaseView/22/0/0/4065372</objectHrefTerm><PublicDate>29.05.2026 11:42</PublicDate><purchAmount>1200000.00</purchAmount><purchCurrency>RUB</purchCurrency></hits></datarow>"
            }
          }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }

    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  const tenders = await searchSberbankAstTenders("поставка", 8, { law44: true, law223: true });

  assert.equal(tenders.length, 2);
  assert.equal(tenders[0]?.platform.includes("Сбербанк-АСТ"), true);
  assert.equal(tenders[1]?.platform.includes("Сбербанк-АСТ"), true);
  assert.equal(new Set(seenUrls).size, 2);
  assert.ok(seenUrls.some((url) => url.includes("SearchQuery.aspx?name=Main")));
  assert.ok(seenUrls.some((url) => url.includes("Trade/SearchQuery/BidList")));
});
