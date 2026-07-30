#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = process.cwd();
const home = path.join(root, "index.html");

const legacyLogoDir = path.join(root, "wp-content/uploads/2024/10");
const currentLogo = path.join(root, "wp-content/uploads/2026/05/Logo-1-scaled.png");
const legacyLogo = path.join(legacyLogoDir, "Logo-alvaro-caballeo.png");
const legacyLogoVariants = [
  "Logo-alvaro-caballeo-1280x351.png",
  "Logo-alvaro-caballeo-980x268.png",
  "Logo-alvaro-caballeo-480x131.png",
];

fs.mkdirSync(legacyLogoDir, { recursive: true });
if (fs.existsSync(currentLogo) && !fs.existsSync(legacyLogo)) {
  fs.copyFileSync(currentLogo, legacyLogo);
}
if (fs.existsSync(currentLogo)) {
  for (const variant of legacyLogoVariants) {
    const target = path.join(legacyLogoDir, variant);
    if (!fs.existsSync(target)) fs.copyFileSync(currentLogo, target);
  }
}

const linkMap = {
  et_pb_row_3: "./Lion-House/index.html",
  et_pb_text_2: "./Lion-House/index.html",
  et_pb_row_4: "./portfolio/bellaterra/index.html",
  et_pb_row_5: "./portfolio/or/index.html",
  et_pb_row_6: "./santa-creu/index.html",
  et_pb_text_5: "./santa-creu/index.html",
  et_pb_row_7: "./portfolio/barcelona/index.html",
  et_pb_row_8: "./terranova/index.html",
  et_pb_row_9: "./portfolio/perdius/index.html",
  et_pb_row_11: "./portfolio/matadepera/index.html",
};

function injectProjectClickFallback(html) {
  const marker = "<!-- local-project-click-fallback -->";
  const fallback = `${marker}
<script>
(function () {
  var links = ${JSON.stringify(linkMap)};
  Object.keys(links).forEach(function (className) {
    Array.prototype.forEach.call(document.querySelectorAll("." + className), function (node) {
      node.setAttribute("role", "link");
      node.setAttribute("tabindex", "0");
      node.addEventListener("click", function (event) {
        if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        window.location.href = links[className];
      });
      node.addEventListener("keydown", function (event) {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          window.location.href = links[className];
        }
      });
    });
  });
}());
</script>`;

  if (html.includes(marker)) {
    return html.replace(new RegExp(`${marker}[\\s\\S]*?<\\/script>`), fallback);
  }
  return html.replace("</body>", `${fallback}\n</body>`);
}

function repairHomeVideo(html) {
  const marker = "<!-- local-home-video-repair -->";
  const repair = `${marker}
<style>
.et_pb_section_video.local-home-video-ready {
  position: relative !important;
  overflow: hidden !important;
  background: #292929 !important;
}
.et_pb_section_video.local-home-video-ready:before {
  display: none !important;
}
.et_pb_section_video.local-home-video-ready .et_pb_section_video_bg,
.et_pb_section_video.local-home-video-ready > div {
  visibility: visible !important;
}
.et_pb_section_video.local-home-video-ready .et_pb_section_video_bg {
  position: absolute !important;
  inset: 0 !important;
  display: block !important;
  z-index: 0 !important;
  overflow: hidden !important;
}
.et_pb_section_video.local-home-video-ready .et_pb_section_video_bg video {
  position: absolute !important;
  top: 50% !important;
  left: 50% !important;
  width: 100% !important;
  height: 100% !important;
  min-width: 100% !important;
  min-height: 100% !important;
  object-fit: cover !important;
  transform: translate(-50%, -50%) !important;
  display: block !important;
  visibility: visible !important;
  opacity: 1 !important;
}
.et_pb_section_video.local-home-video-ready .et_pb_row {
  position: relative !important;
  z-index: 2 !important;
  visibility: visible !important;
}
</style>
<script>
(function () {
  function setupHomeVideos() {
    Array.prototype.forEach.call(document.querySelectorAll(".et_pb_section_video"), function (section) {
      var video = section.querySelector("video");
      if (!video) return;
      section.classList.remove("et_pb_preload");
      section.classList.add("local-home-video-ready");
      video.muted = true;
      video.autoplay = true;
      video.loop = true;
      video.playsInline = true;
      video.setAttribute("muted", "");
      video.setAttribute("autoplay", "");
      video.setAttribute("loop", "");
      video.setAttribute("playsinline", "");
      video.setAttribute("preload", "auto");

      function reveal() {
        section.classList.remove("et_pb_preload");
        section.classList.add("local-home-video-ready");
      }

      video.addEventListener("loadeddata", reveal);
      video.addEventListener("canplay", reveal);
      video.addEventListener("playing", reveal);
      try { video.load(); } catch (error) {}
      var playPromise = video.play();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(function () { reveal(); });
      }
      reveal();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setupHomeVideos);
  } else {
    setupHomeVideos();
  }
  window.addEventListener("load", setupHomeVideos);
}());
</script>`;

  if (html.includes(marker)) {
    return html.replace(new RegExp(`${marker}[\\s\\S]*?<\\/script>`), repair);
  }
  return html.replace("</body>", `${repair}\n</body>`);
}

if (fs.existsSync(home)) {
  const homeHtml = fs.readFileSync(home, "utf8");
  fs.writeFileSync(home, repairHomeVideo(injectProjectClickFallback(homeHtml)));
}

const aboutPage = path.join(root, "sobre-mi/index.html");

function repairAboutCarousel(html) {
  html = html
    .replace(/\s*<script type="speculationrules">[\s\S]*?<\/script>/, "")
    .replace(
      ".et_pb_slider .et_pb_slide_0{background-image:url(../wp-content/uploads/2024/11/FOTO_SOBRE_MI_vertical.jpg);background-color:#7EBEC5}",
      ".et_pb_slider .et_pb_slide_0{background-image:none;background-color:#7EBEC5}"
    );

  const marker = "<!-- local-about-carousel-repair -->";
  const repair = `${marker}
<style>
.et_pb_slider_0.local-about-carousel-ready { position: relative; overflow: hidden; }
.et_pb_slider_0.local-about-carousel-ready {
  height: 565px;
  background-size: cover;
  background-position: center;
}
.et_pb_slider_0.local-about-carousel-ready .et_pb_slides { display: none !important; }
.et_pb_slider_0.local-about-carousel-ready .et_pb_slide {
  position: absolute !important;
  inset: 0;
  display: block !important;
  float: none !important;
  width: 100% !important;
  margin: 0 !important;
  opacity: 0;
  z-index: 1;
  pointer-events: none;
  transition: opacity 420ms ease;
  background-size: cover;
  background-position: center;
}
.et_pb_slider_0.local-about-carousel-ready .et_pb_slide.et-pb-active-slide {
  opacity: 1;
  z-index: 2;
  pointer-events: auto;
}
.et_pb_slider_0.local-about-carousel-ready .local-about-arrow {
  position: absolute;
  top: 50%;
  z-index: 20;
  width: 44px;
  height: 44px;
  margin-top: -22px;
  border: 0;
  border-radius: 0;
  background: rgba(0, 0, 0, 0.38);
  color: #fff;
  cursor: pointer;
  font-size: 34px;
  line-height: 44px;
  text-align: center;
}
.et_pb_slider_0.local-about-carousel-ready .local-about-prev { left: 12px; }
.et_pb_slider_0.local-about-carousel-ready .local-about-next { right: 12px; }
.et_pb_slider_0.local-about-carousel-ready .local-about-dots {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 18px;
  z-index: 20;
  display: flex;
  justify-content: center;
  gap: 10px;
}
.et_pb_slider_0.local-about-carousel-ready .local-about-dot {
  width: 9px;
  height: 9px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.55);
  cursor: pointer;
}
.et_pb_slider_0.local-about-carousel-ready .local-about-dot.is-active { background: #fff; }
@media (max-width: 767px) {
  .et_pb_slider_0.local-about-carousel-ready { height: 420px; }
}
</style>
<script>
(function () {
  var images = [
    "../wp-content/uploads/2025/11/SM-6.jpg",
    "../wp-content/uploads/2025/04/SM_3.jpg",
    "../wp-content/uploads/2025/04/SM-5.jpg",
    "../wp-content/uploads/2025/11/SM-8-scaled.jpg"
  ];

  function setupAboutCarousel() {
    var slider = document.querySelector(".et_pb_slider_0");
    if (!slider) return;
    var broken = slider.querySelector(".et_pb_slide_0");
    if (broken) broken.remove();
    if (!images.length) return;
    slider.classList.remove("et_slider_auto", "et_slider_auto_ignore_hover");
    slider.classList.add("local-about-carousel-ready");

    Array.prototype.forEach.call(slider.querySelectorAll(".local-about-arrow, .local-about-dots"), function (node) {
      node.remove();
    });

    var current = 0;
    var prev = document.createElement("button");
    var next = document.createElement("button");
    var dotsWrap = document.createElement("div");
    prev.type = "button";
    next.type = "button";
    prev.className = "local-about-arrow local-about-prev";
    next.className = "local-about-arrow local-about-next";
    prev.setAttribute("aria-label", "Imagen anterior");
    next.setAttribute("aria-label", "Imagen siguiente");
    prev.innerHTML = "&lsaquo;";
    next.innerHTML = "&rsaquo;";
    dotsWrap.className = "local-about-dots";

    images.forEach(function (src) {
      var image = new Image();
      image.src = src;
    });

    var dots = images.map(function (_, index) {
      var dot = document.createElement("button");
      dot.type = "button";
      dot.className = "local-about-dot";
      dot.setAttribute("aria-label", "Ver imagen " + (index + 1));
      dot.addEventListener("click", function () { show(index); restart(); });
      dotsWrap.appendChild(dot);
      return dot;
    });

    function show(index) {
      current = (index + images.length) % images.length;
      slider.style.backgroundImage = "url('" + images[current] + "')";
      slider.setAttribute("data-local-active-image", String(current + 1));
      dots.forEach(function (dot, dotIndex) {
        dot.classList.toggle("is-active", dotIndex === current);
      });
    }

    function move(step) {
      show(current + step);
    }

    var timer;
    function restart() {
      window.clearInterval(timer);
      timer = window.setInterval(function () { move(1); }, 3000);
    }

    prev.addEventListener("click", function () { move(-1); restart(); });
    next.addEventListener("click", function () { move(1); restart(); });
    slider.addEventListener("keydown", function (event) {
      if (event.key === "ArrowLeft") { move(-1); restart(); }
      if (event.key === "ArrowRight") { move(1); restart(); }
    });
    slider.setAttribute("tabindex", "0");
    slider.appendChild(prev);
    slider.appendChild(next);
    slider.appendChild(dotsWrap);
    show(0);
    restart();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setupAboutCarousel);
  } else {
    setupAboutCarousel();
  }
}());
</script>`;

  if (html.includes(marker)) {
    return html.replace(new RegExp(`${marker}[\\s\\S]*?<\\/script>`), repair);
  }
  return html.replace("</body>", `${repair}\n</body>`);
}

if (fs.existsSync(aboutPage)) {
  fs.writeFileSync(aboutPage, repairAboutCarousel(fs.readFileSync(aboutPage, "utf8")));
}

console.log("Local mirror repaired.");
