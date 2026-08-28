/**
 * Text splitting: lines, words, characters.
 *
 * Typography is where a cinematic site is won or lost. A camera move nobody asked for is
 * forgettable; a headline whose lines rise out of a mask on the right beat is the thing people
 * screenshot. But splitting text is also where accessibility and layout are most often broken,
 * so this module is opinionated about four things:
 *
 * 1. **Lines are measured, not guessed.** There is no way to know where a browser will break a
 *    line except to let it break and then read the geometry. Words are wrapped first, their
 *    rects are read in one batch, and words sharing a `top` become a line. Any implementation
 *    that splits on `\n` or on a character count is wrong at the second breakpoint.
 *
 * 2. **It must re-split.** Line boundaries change on resize, and — the one everybody forgets —
 *    they change when the webfont finishes loading, because the fallback has different metrics.
 *    Splitting once on DOMContentLoaded produces line masks that clip mid-word for the first
 *    150ms and stay wrong on rotate. This hooks `onReflow`, which the kernel already fires
 *    after `document.fonts.ready`.
 *
 * 3. **Read-all-then-write-all.** Wrapping in a loop that also measures forces a layout per
 *    word. On a 60-word paragraph that is 60 synchronous reflows. Here every rect is read into
 *    an array, and only then is the DOM touched.
 *
 * 4. **Screen readers get the sentence, not the letters.** A char-split headline reads aloud as
 *    "T. H. E. space. E. D. G. E." unless you tell the AT otherwise. The root gets an
 *    `aria-label` with the original text and the fragments are `aria-hidden`.
 *
 * The animation itself is not in here. This produces elements and index properties; GSAP or CSS
 * animates them. That separation is why the same split feeds a scroll-scrubbed stagger, an
 * enter() one-shot, and a pure-CSS reveal.
 */
import { state } from '../kernel/state'
import { onReflow } from '../kernel/viewport'
import { gsap } from '../kernel/scroll'

export type SplitMode = 'lines' | 'words' | 'chars'

export interface SplitOptions {
  /**
   * Which levels to produce. Order does not matter. Asking for `['lines','chars']` gives you
   * both, nested — line wrappers containing char spans — which is what a "mask the line, stagger
   * the letters" reveal needs.
   */
  modes?: SplitMode[]
  /**
   * Wrap each line in an extra element with `overflow: hidden`, so a `translateY(100%)` start
   * state is invisible. This is the mask reveal, and it is the single most-used text effect in
   * the genre. Costs one extra element per line.
   */
  mask?: boolean
  /** Class prefix. Elements get `${prefix}-line`, `-word`, `-char`. */
  prefix?: string
  /** Re-split on reflow (resize, font load, orientation). Default true. Almost never turn off. */
  responsive?: boolean
  /** Set `aria-label` on the root and hide the fragments from AT. Default true. */
  aria?: boolean
}

export interface SplitText {
  root: HTMLElement
  lines: HTMLElement[]
  words: HTMLElement[]
  chars: HTMLElement[]
  /** Re-measure and rebuild. Called automatically on reflow unless `responsive: false`. */
  refresh(): void
  /** Put the original markup back and drop the reflow listener. */
  revert(): void
}

const SPACE = /\s+/

/**
 * Split one element.
 *
 * Returns live arrays of the generated elements. Each one carries `--i` (its index within its
 * own level) and `--n` (the level's total), so a CSS-only stagger needs no JS:
 *
 *   .cw-char { transition-delay: calc(var(--i) * 24ms) }
 *
 * and a percentage-based one — which is what you want when the line count varies — reads
 * `calc(var(--i) / var(--n))`.
 */
export function splitText(target: HTMLElement | string, opts: SplitOptions = {}): SplitText {
  const root = typeof target === 'string' ? document.querySelector<HTMLElement>(target) : target
  if (!root) throw new Error(`[split] no element for ${String(target)}`)

  const modes = new Set<SplitMode>(opts.modes ?? ['lines'])
  const prefix = opts.prefix ?? 'cw'
  const mask = opts.mask ?? modes.has('lines')
  const wantAria = opts.aria ?? true

  // The single source of truth for restoring. Captured before anything is touched, so repeated
  // refreshes always rebuild from clean markup instead of from the previous split's output —
  // that compounding is how you end up with span nesting 40 deep after a few resizes.
  const originalHTML = root.innerHTML
  const originalText = (root.textContent ?? '').replace(/\s+/g, ' ').trim()

  const result: SplitText = {
    root,
    lines: [],
    words: [],
    chars: [],
    refresh: () => {},
    revert: () => {},
  }

  const build = () => {
    root.innerHTML = originalHTML
    result.lines = []
    result.words = []
    result.chars = []

    /* ---------------------------------------------------------- pass 1: words */

    // Collect text nodes first. Mutating while walking a live NodeList skips nodes.
    const textNodes: Text[] = []
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if ((n.textContent ?? '').trim()) textNodes.push(n as Text)
    }

    const words: HTMLElement[] = []

    for (const node of textNodes) {
      const parent = node.parentNode
      if (!parent) continue
      const parts = (node.textContent ?? '').split(SPACE).filter(Boolean)
      const frag = document.createDocumentFragment()

      parts.forEach((part, i) => {
        const word = document.createElement('span')
        word.className = `${prefix}-word`
        // inline-block is mandatory: transforms and overflow do nothing on an inline box.
        // The cost is that the browser can no longer break *inside* a word, which for
        // display type is what you want anyway.
        word.style.display = 'inline-block'
        word.textContent = part
        frag.appendChild(word)
        words.push(word)
        // A real text node, not a margin. Margins do not collapse at line ends, so a
        // margin-based space leaves a phantom indent on every wrapped line.
        if (i < parts.length - 1) frag.appendChild(document.createTextNode(' '))
      })

      parent.replaceChild(frag, node)
    }

    /* --------------------------------------- pass 2: read geometry, all at once */

    // One layout flush for the whole element. Interleaving reads and writes here is the
    // classic layout-thrash bug and it is very visible on a long paragraph.
    const tops = words.map((w) => w.getBoundingClientRect().top)

    /* ---------------------------------------------------------- pass 3: lines */

    if (modes.has('lines') && words.length) {
      const groups: HTMLElement[][] = []
      let current: HTMLElement[] = [words[0]]
      let lineTop = tops[0]

      for (let i = 1; i < words.length; i++) {
        // 2px of tolerance absorbs sub-pixel baseline differences between fonts on the same
        // line (an inline <em> at a different size, superscripts, emoji).
        if (Math.abs(tops[i] - lineTop) > 2) {
          groups.push(current)
          current = []
          lineTop = tops[i]
        }
        current.push(words[i])
      }
      groups.push(current)

      for (const group of groups) {
        const line = document.createElement('span')
        line.className = `${prefix}-line`
        line.style.display = 'block'

        let inner: HTMLElement = line
        if (mask) {
          // The mask is the outer element and the animated element is the inner one. Doing it
          // the other way round — animating the element that has overflow:hidden — clips
          // nothing, because an element never clips itself.
          line.style.overflow = 'hidden'
          inner = document.createElement('span')
          inner.className = `${prefix}-line-inner`
          inner.style.display = 'inline-block'
          // The grouping was derived from the real layout, so this content fits by
          // construction. nowrap stops a sub-pixel rounding difference from re-wrapping it
          // into two lines inside a one-line-tall mask, which would clip half the text.
          inner.style.whiteSpace = 'nowrap'
          line.appendChild(inner)
        }

        const first = group[0]
        first.parentNode?.insertBefore(line, first)
        group.forEach((word, i) => {
          inner.appendChild(word)
          if (i < group.length - 1) inner.appendChild(document.createTextNode(' '))
        })

        result.lines.push(mask ? inner : line)
      }

      // Whitespace text nodes orphaned by the regrouping. Left in place they add a stray
      // space at the start of every line.
      const strays = [...root.childNodes].filter(
        (n) => n.nodeType === Node.TEXT_NODE && !(n.textContent ?? '').trim(),
      )
      for (const s of strays) s.remove()
    }

    /* ---------------------------------------------------------- pass 4: chars */

    if (modes.has('chars')) {
      for (const word of words) {
        const text = word.textContent ?? ''
        word.textContent = ''
        // Array.from, not split(''): split('') cuts surrogate pairs in half, so an emoji or
        // any astral-plane glyph becomes two broken boxes.
        for (const ch of Array.from(text)) {
          const span = document.createElement('span')
          span.className = `${prefix}-char`
          span.style.display = 'inline-block'
          span.textContent = ch
          word.appendChild(span)
          result.chars.push(span)
        }
      }
    }

    // Words are always exposed, even when only lines were asked for — they were built as
    // scaffolding either way, and they are occasionally what you actually want to stagger.
    result.words = words

    /* ---------------------------------------------------- indices + accessibility */

    const stamp = (list: HTMLElement[]) => {
      const n = String(list.length)
      list.forEach((el, i) => {
        el.style.setProperty('--i', String(i))
        el.style.setProperty('--n', n)
        if (wantAria) el.setAttribute('aria-hidden', 'true')
      })
    }
    stamp(result.lines)
    stamp(result.words)
    stamp(result.chars)

    if (wantAria && originalText) {
      root.setAttribute('aria-label', originalText)
      // Without a role, some screen readers ignore aria-label on a generic element. `text`
      // is the correct role for a run of characters and is widely supported.
      if (!root.hasAttribute('role')) root.setAttribute('role', 'text')
    }

    root.dataset.split = 'true'
  }

  build()

  const off = opts.responsive === false ? () => {} : onReflow(build)

  result.refresh = build
  result.revert = () => {
    off()
    root.innerHTML = originalHTML
    root.removeAttribute('aria-label')
    root.removeAttribute('role')
    delete root.dataset.split
    result.lines = []
    result.words = []
    result.chars = []
  }

  return result
}

/* ------------------------------------------------------------------ animation */

export interface TextRevealOptions {
  /** Which level to animate. Defaults to lines if present, then words, then chars. */
  level?: SplitMode
  /** Seconds per element. */
  duration?: number
  /** Seconds between elements. 0.03–0.08 for lines, 0.01–0.02 for chars. */
  stagger?: number
  /** Start offset in percent of the element's own height. 100 = fully below a line mask. */
  y?: number
  /** Rotate each element slightly. 4–8 degrees reads as letterpress; more looks like a toy. */
  rotate?: number
  /** Fade as well as move. Off by default — with a mask, opacity is redundant and muddier. */
  fade?: boolean
  ease?: string
  /** Animate from the end backwards. For exits, and for text leaving in the scroll direction. */
  reverse?: boolean
}

/** A GSAP timeline, without depending on gsap's global namespace declaration. */
export type Timeline = ReturnType<typeof gsap.timeline>

/**
 * A paused GSAP timeline for a split.
 *
 * Returned paused on purpose. What drives it is a decision only the scene can make:
 *
 *   tl.play()                                   // one-shot, from enter()
 *   tl.progress(ctx.frame.local)                // scrubbed by scroll, reversible
 *   tl.progress(w)                              // tied to the scene's blend weight
 *
 * The scrubbed form is the one that makes a site feel authored rather than triggered, and it
 * only works because the timeline is a pure function of progress — no `from()` tweens that
 * record their start state on first play.
 */
export function textTimeline(split: SplitText, opts: TextRevealOptions = {}): Timeline {
  const level =
    opts.level ??
    (split.lines.length ? 'lines' : split.words.length ? 'words' : 'chars')
  const els = level === 'lines' ? split.lines : level === 'words' ? split.words : split.chars

  const tl = gsap.timeline({ paused: true })
  if (!els.length) return tl

  if (state.reducedMotion) {
    // Present, unanimated. Not "animated faster" — the point of the preference is no motion.
    tl.set(els, { yPercent: 0, opacity: 1, rotate: 0 })
    return tl
  }

  const y = opts.y ?? (level === 'lines' ? 105 : 60)

  tl.fromTo(
    els,
    {
      yPercent: opts.reverse ? -y : y,
      rotate: opts.rotate ?? 0,
      opacity: opts.fade ? 0 : 1,
    },
    {
      yPercent: 0,
      rotate: 0,
      opacity: 1,
      duration: opts.duration ?? 1,
      // expo.out is the house ease for type: almost all of the distance is covered in the
      // first third, so the eye reads the word before the motion finishes.
      ease: opts.ease ?? 'expo.out',
      stagger: {
        each: opts.stagger ?? (level === 'chars' ? 0.018 : 0.06),
        from: opts.reverse ? 'end' : 'start',
      },
    },
  )

  return tl
}

/**
 * Split everything marked up in the HTML, and hand back a lookup by id.
 *
 * The convention:
 *
 *   <h1 data-split="chars" data-split-id="hero">THE EDGE OF THE WORLD</h1>
 *
 * `data-split` is the mode list (comma separated), `data-split-id` is the key. Call once after
 * boot, then pull what a scene needs out of the map. Keeps every split under one reflow
 * listener instead of one per element.
 */
export function initSplits(
  selector = '[data-split]',
  opts: SplitOptions = {},
): Map<string, SplitText> {
  const map = new Map<string, SplitText>()
  const els = document.querySelectorAll<HTMLElement>(selector)

  els.forEach((el, i) => {
    const declared = (el.dataset.split ?? '').split(',').map((s) => s.trim()).filter(Boolean)
    const modes = (declared.length ? declared : ['lines']) as SplitMode[]
    const id = el.dataset.splitId ?? `split-${i}`
    map.set(id, splitText(el, { ...opts, modes }))
  })

  return map
}
