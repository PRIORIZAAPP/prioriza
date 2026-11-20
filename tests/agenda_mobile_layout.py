"""Check mobile Agenda geometry against an isolated PRIORIZA instance."""

import argparse
import os

from playwright.sync_api import expect, sync_playwright

WIDTHS = (320, 360, 375, 390, 430)
MAIN_FIELDS = ("agenda-titulo", "agenda-data", "agenda-hora", "agenda-hora-fim")
ADVANCED_FIELDS = (
    "agenda-categoria", "agenda-prioridade", "agenda-local",
    "agenda-repetir", "agenda-repetir-ate", "agenda-sincronizar-google",
)


def check_widths(panel, fields):
    report = panel.evaluate("""(panel, fields) => {
        const scroller = panel.querySelector('.agenda-mobile-conteudo');
        const nodes = [
            panel, panel.querySelector('form'), scroller,
            ...fields.map(id => panel.querySelector('#' + id)),
        ];
        if (panel.querySelector('details').open) {
            nodes.push(...panel.querySelectorAll(
                '.form-more-body, .agenda-data-formatada'
            ));
        }
        const clip = scroller.getBoundingClientRect();
        return nodes.filter(node => node.getClientRects().length).map(node => {
            const {left, right} = node.getBoundingClientRect();
            return {
                name: node.id || node.className,
                extra: node.scrollWidth - node.clientWidth,
                outside: node !== panel && node !== panel.querySelector('form')
                    && (left < clip.left - 1 || right > clip.right + 1),
            };
        });
    }""", fields)
    assert all(item["extra"] <= 1 and not item["outside"] for item in report), report


def check_layout(context, url, token, width):
    page = context.new_page()
    page.add_init_script(script=f"localStorage.setItem('prioriza_auth_token', {token!r})")
    page.goto(url + "/app")
    page.locator("#app-shell:not([hidden])").wait_for()
    page.locator("#splash-screen.is-visible, #splash-screen.is-hiding").wait_for(state="hidden")
    page.locator('.bottom-nav [data-target="screen-agenda"]').tap()
    page.locator("#btn-toggle-form-agenda").tap()
    panel = page.locator("#agenda-form-wrap .checklist-form-panel")
    scroller = panel.locator(".agenda-mobile-conteudo")
    position = panel.bounding_box()
    assert abs(position["x"] + position["width"] / 2 - width / 2) < 1, position
    assert abs(position["y"] + position["height"] / 2 - 380) < 2, position
    assert scroller.evaluate("el => el.scrollHeight === el.clientHeight")
    check_widths(panel, MAIN_FIELDS)

    first, last = (panel.locator("#" + field).bounding_box() for field in MAIN_FIELDS[-2:])
    assert first["x"] + first["width"] < last["x"]
    assert abs(first["width"] - last["width"]) < 1 and abs(first["y"] - last["y"]) < 1

    panel.locator("summary").tap()
    expect(panel.locator("#agenda-repetir-ate")).to_be_hidden()
    panel.locator("#agenda-repetir").select_option("DIARIA")
    panel.locator("#agenda-repetir-ate").fill("2026-12-15")
    panel.locator("#agenda-local").evaluate("""select => {
        const area = 'Área-' + 'W'.repeat(70);
        select.add(new Option(area, area, false, true));
    }""")
    check_widths(panel, MAIN_FIELDS + ADVANCED_FIELDS)
    scroller.evaluate("el => { el.scrollLeft = 200; el.scrollTop = el.scrollHeight; }")
    assert scroller.evaluate("el => el.scrollLeft === 0")
    expect(panel.locator(".agenda-google-opcao")).to_be_in_viewport()
    expect(panel.locator("#btn-salvar-compromisso")).to_be_in_viewport()
    expect(panel.locator("#btn-fechar-form-agenda")).to_be_in_viewport()
    assert page.evaluate("document.getElementById('app-shell').inert")
    if width == 390:
        page.evaluate("""() => {
            Object.defineProperties(visualViewport, {
                width: { value: 320, configurable: true },
                offsetLeft: { value: 24, configurable: true },
            });
            visualViewport.dispatchEvent(new Event('resize'));
        }""")
        page.wait_for_function("""() => {
            const wrap = document.getElementById('agenda-form-wrap');
            return getComputedStyle(wrap).width === '320px' && getComputedStyle(wrap).left === '24px';
        }""")
        position = panel.evaluate("el => el.getBoundingClientRect().toJSON()")
        assert position["x"] >= 24 and position["x"] + position["width"] <= 344, position
        assert abs(position["x"] + position["width"] / 2 - 184) < 1, position
        check_widths(panel, MAIN_FIELDS + ADVANCED_FIELDS)
    panel.locator("#btn-fechar-form-agenda").tap()
    assert not page.evaluate("document.getElementById('app-shell').inert")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="http://127.0.0.1:8164")
    parser.add_argument("--engine", choices=("chromium", "webkit"), required=True)
    parser.add_argument("--executable")
    args = parser.parse_args()
    url = args.url.rstrip("/")
    with sync_playwright() as p:
        launch = {"executable_path": args.executable} if args.executable else {}
        browser = getattr(p, args.engine).launch(**launch)
        for width in WIDTHS:
            context = browser.new_context(
                viewport={"width": width, "height": 760}, is_mobile=True, has_touch=True,
                locale="pt-BR", reduced_motion="reduce",
            )
            login = context.request.post(url + "/auth/login", data={
                "email": os.environ["PRIORIZA_TEST_EMAIL"],
                "senha": os.environ["PRIORIZA_TEST_PASSWORD"],
            })
            assert login.ok, f"Login do ambiente de teste retornou HTTP {login.status}"
            check_layout(context, url, login.json()["token"], width)
            print(f"{args.engine} {width}px: OK", flush=True)
            context.close()


if __name__ == "__main__":
    main()
