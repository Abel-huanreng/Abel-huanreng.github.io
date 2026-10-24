(function () {
    "use strict";

    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    /* ---------- Year ---------- */
    const yearEl = document.getElementById("year");
    if (yearEl) yearEl.textContent = String(new Date().getFullYear());

    /* ---------- Back to top ---------- */
    const backToTop = document.getElementById("backToTop");
    let scrollTicking = false;

    function updateScrollUI() {
        if (backToTop) backToTop.classList.toggle("is-visible", window.scrollY > 640);
    }

    window.addEventListener("scroll", function () {
        if (scrollTicking) return;
        scrollTicking = true;
        requestAnimationFrame(function () {
            updateScrollUI();
            updateActiveTab();
            scrollTicking = false;
        });
    }, { passive: true });
    updateScrollUI();

    if (backToTop) {
        backToTop.addEventListener("click", function () {
            window.scrollTo({ top: 0, behavior: prefersReduced ? "auto" : "smooth" });
        });
    }

    /* ---------- Scroll reveal ---------- */
    const revealEls = document.querySelectorAll(".reveal");
    if (!("IntersectionObserver" in window) || prefersReduced) {
        revealEls.forEach(function (el) { el.classList.add("is-visible"); });
    } else {
        const revealObserver = new IntersectionObserver(function (entries, observer) {
            entries.forEach(function (entry) {
                if (!entry.isIntersecting) return;
                entry.target.classList.add("is-visible");
                observer.unobserve(entry.target);
            });
        }, { threshold: 0, rootMargin: "0px 0px -6% 0px" });
        revealEls.forEach(function (el) { revealObserver.observe(el); });
    }

    /* ---------- Active top tab ---------- */
    const tabLinks = Array.prototype.slice.call(document.querySelectorAll(".top-tabs a"));
    const tabTargets = [];
    tabLinks.forEach(function (link) {
        const href = link.getAttribute("href") || "";
        if (href.charAt(0) !== "#") return;
        const id = href.slice(1);
        const el = document.getElementById(id);
        if (el) tabTargets.push({ id: id, el: el, link: link });
    });

    let activeTabId = "top";

    function updateActiveTab() {
        if (!tabTargets.length) return;
        const marker = window.scrollY + 160;
        let current = "top";
        let bestTop = -Infinity;

        tabTargets.forEach(function (target) {
            const top = target.el.getBoundingClientRect().top + window.scrollY;
            if (top <= marker && top > bestTop) {
                bestTop = top;
                current = target.id;
            }
        });

        if (current === activeTabId) return;
        activeTabId = current;
        tabTargets.forEach(function (target) {
            if (target.id === current) {
                target.link.setAttribute("aria-current", "true");
            } else {
                target.link.removeAttribute("aria-current");
            }
        });
    }

    updateActiveTab();
    window.addEventListener("load", updateActiveTab);
    window.addEventListener("resize", function () {
        window.setTimeout(updateActiveTab, 120);
    });

    /* ---------- Theme switcher ---------- */
    (function themeSwitcher() {
        const root = document.documentElement;
        const toggle = document.getElementById("themeToggle");
        const panel = document.getElementById("themePanel");
        if (!toggle || !panel) return;

        const options = Array.prototype.slice.call(panel.querySelectorAll("[data-theme-value]"));
        const themeColorMeta = document.querySelector('meta[name="theme-color"]');
        const colorSchemeMeta = document.querySelector('meta[name="color-scheme"]');
        const themeColors = {
            github: "#ffffff",
            nebula: "#05060b",
            cyber: "#030305",
            aurora: "#f4f5fa",
            terminal: "#020604"
        };
        const themeSchemes = {
            github: "light",
            nebula: "dark",
            cyber: "dark",
            aurora: "light",
            terminal: "dark"
        };
        const themes = Object.keys(themeColors);
        let switchTimer = null;

        function currentTheme() {
            const value = root.getAttribute("data-theme");
            return themes.indexOf(value) !== -1 ? value : "github";
        }

        function applyTheme(theme, persist) {
            if (themes.indexOf(theme) === -1) return;
            root.setAttribute("data-theme", theme);
            root.style.colorScheme = themeSchemes[theme];
            options.forEach(function (option) {
                option.setAttribute("aria-pressed", option.getAttribute("data-theme-value") === theme ? "true" : "false");
            });
            if (themeColorMeta) themeColorMeta.setAttribute("content", themeColors[theme]);
            if (colorSchemeMeta) colorSchemeMeta.setAttribute("content", themeSchemes[theme]);

            if (persist) {
                try { localStorage.setItem("site-theme-v2", theme); } catch (e) {}
                root.classList.add("theme-switching");
                window.clearTimeout(switchTimer);
                switchTimer = window.setTimeout(function () {
                    root.classList.remove("theme-switching");
                }, 480);
            }
        }

        function isOpen() {
            return panel.classList.contains("is-open");
        }

        function setOpen(open) {
            panel.classList.toggle("is-open", open);
            toggle.setAttribute("aria-expanded", open ? "true" : "false");
        }

        applyTheme(currentTheme(), false);

        toggle.addEventListener("click", function (event) {
            event.stopPropagation();
            setOpen(!isOpen());
        });

        options.forEach(function (option) {
            option.addEventListener("click", function () {
                applyTheme(option.getAttribute("data-theme-value"), true);
                setOpen(false);
                toggle.focus();
            });
        });

        document.addEventListener("click", function (event) {
            if (!isOpen()) return;
            if (panel.contains(event.target) || toggle.contains(event.target)) return;
            setOpen(false);
        });

        document.addEventListener("keydown", function (event) {
            if (event.key === "Escape" && isOpen()) {
                setOpen(false);
                toggle.focus();
            }
        });
    })();

    /* ---------- Live GitHub stats ---------- */
    (function githubStats() {
        const repoStat = document.querySelector('[data-stat="repos"]');
        const forkStat = document.querySelector('[data-stat="forks"]');
        const starEls = Array.prototype.slice.call(document.querySelectorAll(".repo-star[data-repo]"));
        if (!repoStat && !forkStat && !starEls.length) return;

        const controller = "AbortController" in window ? new AbortController() : null;
        const timer = controller ? window.setTimeout(function () { controller.abort(); }, 8000) : null;

        function setCount(el, value) {
            if (!el) return;
            el.textContent = String(value).padStart(2, "0");
        }

        fetch("https://api.github.com/users/Abel-huanreng/repos?per_page=100", {
            headers: { Accept: "application/vnd.github+json" },
            signal: controller ? controller.signal : undefined
        })
            .then(function (response) {
                return response.ok ? response.json() : Promise.reject(new Error("GitHub API " + response.status));
            })
            .then(function (repos) {
                if (!Array.isArray(repos)) return;

                setCount(repoStat, repos.length);
                if (forkStat) {
                    setCount(forkStat, repos.filter(function (repo) { return repo.fork; }).length);
                }

                const byName = {};
                repos.forEach(function (repo) {
                    byName[String(repo.name).toLowerCase()] = repo;
                });

                starEls.forEach(function (el) {
                    const repo = byName[String(el.getAttribute("data-repo")).toLowerCase()];
                    if (!repo || !repo.stargazers_count) return;
                    el.textContent = "★ " + repo.stargazers_count;
                    el.setAttribute("aria-label", repo.stargazers_count + " stars");
                    el.removeAttribute("hidden");
                });
            })
            .catch(function () {
                /* keep the static snapshot */
            })
            .finally(function () {
                if (timer) window.clearTimeout(timer);
            });
    })();
})();
