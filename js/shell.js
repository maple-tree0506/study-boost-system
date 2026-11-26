/*
 * App shell: views, navigation, and motion.
 *
 * Every view stays in the DOM, so app.js keeps its element references and state
 * while the student moves around. This file only decides which view is showing and
 * how the change looks. It holds no learning logic and no data.
 *
 *   Shell.go(name)            -> Promise, resolves once the view is on screen.
 *                                A view can carry one parameter: Shell.go("mistake/err-123")
 *   Shell.current()           -> name of the visible view
 *   Shell.param()             -> the current view's parameter ("" when none)
 *   Shell.confirm(options)    -> Promise<boolean>, themed replacement for window.confirm
 *   Shell.countUp(el, to)     -> animate a number, respecting reduced motion
 *   Shell.reducedMotion()     -> true if the device or the student's setting asks for less motion
 *   Shell.setBand(info|null)  -> show { num, of, label } in the band instead of the page name
 *
 * Fires "studyboost:view" on document with detail { view, param } after each change,
 * including a parameter change on the same view (one mistake to another).
 */
(function () {
    "use strict";

    var VIEWS = ["home", "notes", "practice", "review", "progress", "setup", "mistake"];
    // Sub-pages keep their parent's place in the navigation.
    var NAV_PARENT = { mistake: "review" };
    // Old in-page anchors keep working (e.g. a shared link to #quiz-title).
    var LEGACY_HASHES = {
        "quiz-title": "practice",
        "summary-title": "notes",
        "errors-title": "review",
        "insights-label": "progress"
    };
    var BAND = {
        home: { word: "STUDY", step: "" },
        notes: { word: "NOTES", step: "1" },
        practice: { word: "PRACTICE", step: "2" },
        review: { word: "REVIEW", step: "3" },
        progress: { word: "PROGRESS", step: "4" },
        setup: { word: "SETUP", step: "" },
        mistake: { word: "MISTAKE", step: "3" }
    };
    var TITLES = {
        notes: "Notes",
        practice: "Practice",
        review: "Review",
        progress: "Progress",
        setup: "Setup",
        mistake: "Practice similar questions"
    };
    var HOME_TITLE = document.title;

    var EASE_IN = "cubic-bezier(.7,0,.84,0)";
    var EASE_OUT = "cubic-bezier(.16,1,.3,1)";

    var motionQuery = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    // The device setting, or the student's own "Reduce motion" choice in Setup
    // (index.html sets data-motion on <html> before first paint).
    function reducedMotion() {
        return !!(motionQuery && motionQuery.matches) || document.documentElement.getAttribute("data-motion") === "reduce";
    }

    var body = document.body;
    var wipe = document.getElementById("wipe");
    var bandWord = document.getElementById("bandWord");
    var bandStep = document.getElementById("bandStep");
    var bandStripes = document.getElementById("bandStripes");
    var bandCount = document.getElementById("bandCount");
    var navIndicator = document.getElementById("navIndicator");
    var views = Array.prototype.slice.call(document.querySelectorAll(".view"));
    var links = Array.prototype.slice.call(document.querySelectorAll(".nav-link"));

    var current = null;
    var currentParam = "";
    var busy = false;
    var pending = null;     // { name, param } requested while a transition runs
    var waiters = [];
    var scrollMemory = {};

    // "#mistake/err-12" -> { view: "mistake", param: "err-12" }. A sub-page without
    // its parameter falls back to its parent (a bare "#mistake" shows the Review list).
    function parseTarget(text) {
        var raw = String(text || "").replace(/^#\/?/, "");
        var slash = raw.indexOf("/");
        var base = slash === -1 ? raw : raw.slice(0, slash);
        var param = "";
        if (slash !== -1) {
            try { param = decodeURIComponent(raw.slice(slash + 1)); } catch (e) { param = ""; }
        }
        if (VIEWS.indexOf(base) === -1) return { view: LEGACY_HASHES[raw] || "home", param: "" };
        if (NAV_PARENT[base] && !param) return { view: NAV_PARENT[base], param: "" };
        return { view: base, param: NAV_PARENT[base] ? param : "" };
    }

    function hashFor(view, param) {
        return view + (param ? "/" + encodeURIComponent(param) : "");
    }

    // Slide the active marker to the current link. Offsets (not getBoundingClientRect)
    // keep this correct while the page is mid-scroll or mid-transition.
    function placeIndicator() {
        if (!navIndicator) return;
        var active = links.filter(function (a) { return a.hasAttribute("aria-current"); })[0];
        if (!active) return;
        var li = active.parentElement;
        navIndicator.style.setProperty("--ind-x", li.offsetLeft + "px");
        navIndicator.style.setProperty("--ind-y", li.offsetTop + "px");
        navIndicator.style.setProperty("--ind-w", li.offsetWidth + "px");
        navIndicator.style.setProperty("--ind-h", li.offsetHeight + "px");
    }

    function restartAnimation(el, className) {
        el.classList.remove(className);
        void el.offsetWidth; // force a reflow so the keyframes run again
        el.classList.add(className);
    }

    function announce(name, param) {
        document.dispatchEvent(new CustomEvent("studyboost:view", { detail: { view: name, param: param || "" } }));
    }

    function showView(name, param) {
        var navName = NAV_PARENT[name] || name;
        views.forEach(function (v) {
            var on = v.getAttribute("data-view") === name;
            v.hidden = !on;
            if (on) restartAnimation(v, "is-entering");
        });
        links.forEach(function (a) {
            if (a.getAttribute("data-link") === navName) a.setAttribute("aria-current", "page");
            else a.removeAttribute("aria-current");
        });
        body.setAttribute("data-view", name);
        document.title = TITLES[name] ? TITLES[name] + " — StudyBoost" : HOME_TITLE;

        var band = BAND[name];
        if (bandWord) {
            bandWord.textContent = band.word;
            restartAnimation(bandWord, "is-entering");
        }
        if (bandStep) bandStep.textContent = band.step;
        if (bandStripes) bandStripes.hidden = !band.step;
        setBand(null);

        current = name;
        currentParam = param || "";
        placeIndicator();
        // A sub-page always opens at the top: it shows a different item each time.
        window.scrollTo({ top: NAV_PARENT[name] ? 0 : (scrollMemory[name] || 0), behavior: "instant" });
        announce(name, currentParam);
    }

    function focusHeading(name) {
        var view = document.getElementById("view-" + name);
        var heading = view && view.querySelector("h1[tabindex], h2[tabindex]");
        if (heading) heading.focus({ preventScroll: true });
    }

    function settle() {
        var list = waiters;
        waiters = [];
        list.forEach(function (resolve) { resolve(); });
    }

    function finish() {
        busy = false;
        placeIndicator();
        if (pending && (pending.name !== current || pending.param !== currentParam)) {
            var next = pending;
            pending = null;
            transitionTo(next.name, true, next.param);
            return;
        }
        pending = null;
        settle();
    }

    // Three planes (blue, paper, black) slash across on the page's cut, the view changes
    // while they cover it, and they clear the other way. The whole gesture stays under
    // 0.6s so it never slows studying down; the layer never takes clicks.
    function transitionTo(name, moveFocus, param) {
        param = param || "";
        if (name === current) {
            // Same page, different item (one mistake to another): no wipe, just a new item.
            if (param !== currentParam && !busy) {
                currentParam = param;
                window.scrollTo({ top: 0, behavior: "instant" });
                announce(name, param);
                if (moveFocus) focusHeading(name);
            } else if (busy) {
                pending = { name: name, param: param };
                return;
            }
            settle();
            return;
        }
        if (busy) { pending = { name: name, param: param }; return; }
        if (current) scrollMemory[current] = window.scrollY;

        var bands = wipe ? Array.prototype.slice.call(wipe.children) : [];
        if (reducedMotion() || !bands.length || typeof bands[0].animate !== "function") {
            showView(name, param);
            if (moveFocus) focusHeading(name);
            settle();
            return;
        }

        busy = true;
        wipe.classList.add("is-active");
        var covers = bands.map(function (band, i) {
            return band.animate(
                [{ transform: "translateX(-140%) skewX(-24deg)" }, { transform: "translateX(0) skewX(-24deg)" }],
                { duration: 220, delay: i * 50, easing: EASE_IN, fill: "both" }
            );
        });

        Promise.all(covers.map(function (a) { return a.finished; })).then(function () {
            showView(name, param);
            if (moveFocus) focusHeading(name);
            var reveals = bands.map(function (band, i) {
                return band.animate(
                    [{ transform: "translateX(0) skewX(-24deg)" }, { transform: "translateX(140%) skewX(-24deg)" }],
                    { duration: 260, delay: (bands.length - 1 - i) * 40, easing: EASE_OUT, fill: "both" }
                );
            });
            return Promise.all(reveals.map(function (a) { return a.finished; }));
        }).catch(function () {
            // An interrupted animation is not an error; fall through and clean up.
            if (current !== name) showView(name, param);
        }).then(function () {
            bands.forEach(function (band) {
                band.getAnimations().forEach(function (a) { a.cancel(); });
            });
            wipe.classList.remove("is-active");
            finish();
        });
    }

    function go(name) {
        var target = parseTarget(name);
        var hash = hashFor(target.view, target.param);
        return new Promise(function (resolve) {
            if (target.view === current && target.param === currentParam && !busy) { resolve(); return; }
            waiters.push(resolve);
            if (window.location.hash.replace(/^#\/?/, "") !== hash) {
                window.location.hash = hash;
            } else {
                transitionTo(target.view, true, target.param);
            }
        });
    }

    window.addEventListener("hashchange", function () {
        var target = parseTarget(window.location.hash);
        transitionTo(target.view, true, target.param);
    });

    window.addEventListener("resize", placeIndicator);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(placeIndicator);
    // In the horizontal bar a link's width moves the ones after it (the Review badge
    // appears after the first paint), so the marker follows any change in the row's size.
    var navList = navIndicator && navIndicator.parentElement && navIndicator.parentElement.querySelector(".nav-list");
    if (navList && typeof window.ResizeObserver === "function") new window.ResizeObserver(placeIndicator).observe(navList);

    // --- Today line ----------------------------------------------------------
    (function paintToday() {
        var date = document.getElementById("todayDate");
        var part = document.getElementById("todayPart");
        var now = new Date();
        if (date) {
            date.textContent = now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
        }
        if (part && window.HomeSummary) part.textContent = window.HomeSummary.dayPart(now.getHours());
    }());

    // --- Tooltips ------------------------------------------------------------
    // One shared tooltip for chart marks. Text only, written with textContent.
    (function wireTooltips() {
        var tip = document.createElement("div");
        tip.className = "tip";
        tip.setAttribute("aria-hidden", "true");
        tip.hidden = true;
        body.appendChild(tip);

        document.addEventListener("pointerover", function (ev) {
            var host = ev.target instanceof Element ? ev.target.closest("[data-tip]") : null;
            if (!host) { tip.hidden = true; return; }
            tip.textContent = host.getAttribute("data-tip");
            tip.hidden = false;
            var box = host.getBoundingClientRect();
            var w = tip.offsetWidth;
            var h = tip.offsetHeight;
            var left = Math.max(8, Math.min(window.innerWidth - w - 8, box.left + box.width / 2 - w / 2));
            var top = box.top - h - 8;
            if (top < 8) top = box.bottom + 8;
            tip.style.transform = "translate(" + Math.round(left) + "px," + Math.round(top) + "px)";
        });
        window.addEventListener("scroll", function () { tip.hidden = true; }, { passive: true });
    }());

    // --- Dialog --------------------------------------------------------------
    function confirmDialog(options) {
        var dialog = document.getElementById("confirmDialog");
        if (!dialog || typeof dialog.showModal !== "function") {
            return Promise.resolve(window.confirm(options.body));
        }
        document.getElementById("confirmTitle").textContent = options.title;
        document.getElementById("confirmBody").textContent = options.body;
        var ok = document.getElementById("confirmOk");
        ok.textContent = options.confirmLabel || "Confirm";
        ok.className = options.danger ? "danger" : "";
        dialog.returnValue = "cancel";
        dialog.showModal();
        return new Promise(function (resolve) {
            dialog.addEventListener("close", function () {
                resolve(dialog.returnValue === "ok");
            }, { once: true });
        });
    }

    // --- Band count ----------------------------------------------------------
    // A view can put a real number in the band instead of its name: Practice shows the
    // question number during a set, then the score. Text only, set with textContent.
    function setBand(info) {
        if (!bandCount) return;
        if (!info) {
            bandCount.hidden = true;
            body.removeAttribute("data-band");
            return;
        }
        bandCount.textContent = "";
        var num = document.createElement("b");
        num.textContent = info.num;
        var of = document.createElement("span");
        of.textContent = info.of || "";
        var label = document.createElement("em");
        label.textContent = info.label || "";
        bandCount.appendChild(num);
        bandCount.appendChild(of);
        bandCount.appendChild(label);
        bandCount.hidden = false;
        body.setAttribute("data-band", "count");
    }

    // --- Numbers -------------------------------------------------------------
    function countUp(el, to) {
        if (!el) return;
        var end = Number(to) || 0;
        if (reducedMotion() || end <= 0) { el.textContent = String(end); return; }
        var start = performance.now();
        var duration = 700;
        el.textContent = "0";
        (function frame(now) {
            var t = Math.min(1, (now - start) / duration);
            var eased = 1 - Math.pow(1 - t, 3);
            el.textContent = String(Math.round(end * eased));
            if (t < 1) requestAnimationFrame(frame);
        }(start));
    }

    // --- First paint ---------------------------------------------------------
    var first = parseTarget(window.location.hash);
    showView(first.view, first.param);
    // Clear the entrance class with the boot class. Otherwise the hero would fall back
    // to the normal view entrance and replay it the moment "boot" comes off.
    window.setTimeout(function () {
        body.classList.remove("boot");
        views.forEach(function (v) { v.classList.remove("is-entering"); });
    }, 1500);

    window.Shell = {
        go: go,
        current: function () { return current; },
        param: function () { return currentParam; },
        confirm: confirmDialog,
        countUp: countUp,
        reducedMotion: reducedMotion,
        setBand: setBand
    };
})();
