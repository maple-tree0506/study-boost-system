/*
 * App shell: views, navigation, and motion.
 *
 * Every view stays in the DOM, so app.js keeps its element references and state
 * while the student moves around. This file only decides which view is showing and
 * how the change looks. It holds no learning logic and no data.
 *
 *   Shell.go(name)            -> Promise, resolves once the view is on screen
 *   Shell.current()           -> name of the visible view
 *   Shell.confirm(options)    -> Promise<boolean>, themed replacement for window.confirm
 *   Shell.countUp(el, to)     -> animate a number, respecting reduced motion
 *   Shell.reducedMotion()     -> true if the student asked for less motion
 *
 * Fires "studyboost:view" on document with detail { view } after each change.
 */
(function () {
    "use strict";

    var VIEWS = ["home", "notes", "practice", "review", "progress", "setup"];
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
        setup: { word: "SETUP", step: "" }
    };
    var TITLES = {
        notes: "Notes",
        practice: "Practice",
        review: "Review",
        progress: "Progress",
        setup: "Setup"
    };
    var HOME_TITLE = document.title;

    var EASE_IN = "cubic-bezier(.7,0,.84,0)";
    var EASE_OUT = "cubic-bezier(.16,1,.3,1)";

    var motionQuery = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    function reducedMotion() { return !!(motionQuery && motionQuery.matches); }

    var body = document.body;
    var wipe = document.getElementById("wipe");
    var bandWord = document.getElementById("bandWord");
    var bandStep = document.getElementById("bandStep");
    var bandStripes = document.getElementById("bandStripes");
    var navIndicator = document.getElementById("navIndicator");
    var views = Array.prototype.slice.call(document.querySelectorAll(".view"));
    var links = Array.prototype.slice.call(document.querySelectorAll(".nav-link"));

    var current = null;
    var busy = false;
    var pending = null;
    var waiters = [];
    var scrollMemory = {};

    function viewFromHash() {
        var hash = window.location.hash.replace(/^#\/?/, "");
        if (VIEWS.indexOf(hash) !== -1) return hash;
        return LEGACY_HASHES[hash] || "home";
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

    function showView(name) {
        views.forEach(function (v) {
            var on = v.getAttribute("data-view") === name;
            v.hidden = !on;
            if (on) restartAnimation(v, "is-entering");
        });
        links.forEach(function (a) {
            if (a.getAttribute("data-link") === name) a.setAttribute("aria-current", "page");
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

        current = name;
        placeIndicator();
        window.scrollTo({ top: scrollMemory[name] || 0, behavior: "instant" });
        document.dispatchEvent(new CustomEvent("studyboost:view", { detail: { view: name } }));
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
        if (pending && pending !== current) {
            var next = pending;
            pending = null;
            transitionTo(next, true);
            return;
        }
        pending = null;
        settle();
    }

    // Three slanted panels sweep in, the view changes while they cover it, and they
    // sweep out. The whole gesture stays under 0.6s so it never slows studying down.
    function transitionTo(name, moveFocus) {
        if (name === current) { settle(); return; }
        if (busy) { pending = name; return; }
        if (current) scrollMemory[current] = window.scrollY;

        var bands = wipe ? Array.prototype.slice.call(wipe.children) : [];
        if (reducedMotion() || !bands.length || typeof bands[0].animate !== "function") {
            showView(name);
            if (moveFocus) focusHeading(name);
            settle();
            return;
        }

        busy = true;
        wipe.classList.add("is-active");
        var covers = bands.map(function (band, i) {
            return band.animate(
                [{ transform: "translateX(-112%) skewX(-16deg)" }, { transform: "translateX(0) skewX(-16deg)" }],
                { duration: 230, delay: i * 45, easing: EASE_IN, fill: "both" }
            );
        });

        Promise.all(covers.map(function (a) { return a.finished; })).then(function () {
            showView(name);
            if (moveFocus) focusHeading(name);
            var reveals = bands.map(function (band, i) {
                return band.animate(
                    [{ transform: "translateX(0) skewX(-16deg)" }, { transform: "translateX(116%) skewX(-16deg)" }],
                    { duration: 280, delay: (bands.length - 1 - i) * 40, easing: EASE_OUT, fill: "both" }
                );
            });
            return Promise.all(reveals.map(function (a) { return a.finished; }));
        }).catch(function () {
            // An interrupted animation is not an error; fall through and clean up.
            if (current !== name) showView(name);
        }).then(function () {
            bands.forEach(function (band) {
                band.getAnimations().forEach(function (a) { a.cancel(); });
            });
            wipe.classList.remove("is-active");
            finish();
        });
    }

    function go(name) {
        var target = VIEWS.indexOf(name) !== -1 ? name : "home";
        return new Promise(function (resolve) {
            if (target === current && !busy) { resolve(); return; }
            waiters.push(resolve);
            if (viewFromHash() !== target || window.location.hash.replace(/^#\/?/, "") !== target) {
                window.location.hash = target;
            } else {
                transitionTo(target, true);
            }
        });
    }

    window.addEventListener("hashchange", function () {
        transitionTo(viewFromHash(), true);
    });

    window.addEventListener("resize", placeIndicator);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(placeIndicator);

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
    showView(viewFromHash());
    // Clear the entrance class with the boot class. Otherwise the hero would fall back
    // to the normal view entrance and replay it the moment "boot" comes off.
    window.setTimeout(function () {
        body.classList.remove("boot");
        views.forEach(function (v) { v.classList.remove("is-entering"); });
    }, 1500);

    window.Shell = {
        go: go,
        current: function () { return current; },
        confirm: confirmDialog,
        countUp: countUp,
        reducedMotion: reducedMotion
    };
})();
