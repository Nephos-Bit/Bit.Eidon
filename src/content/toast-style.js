(function (root) {
  root.EidonToastStyle = String.raw`
:root,
:host {
  --tm-blue: #0a84ff;
  --tm-card: #1c1c1e;
  --tm-secondary: rgba(235, 235, 245, 0.6);
  --tm-track: #48484a;
  --tm-pill: #3a3a3c;
  --tm-icon: #3a3a3c;
  --tm-radius: 22px;
  --tm-font: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --tm-canvas: #f2f2f7;
  --tm-label: #1c1c1e;
  --tm-separator: rgba(60, 60, 67, 0.18);
  --tm-grouped: rgba(255, 255, 255, 0.78);
  --tm-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.06),
    0 1px 2px rgba(0, 0, 0, 0.05),
    0 4px 8px -2px rgba(0, 0, 0, 0.06),
    0 12px 24px -4px rgba(0, 0, 0, 0.12);
  --tm-muted: rgba(60, 60, 67, 0.72);
  color-scheme: light dark;
}

@media (prefers-color-scheme: dark) {
  :root {
    --tm-canvas: #000000;
    --tm-label: #ffffff;
    --tm-separator: rgba(84, 84, 88, 0.65);
    --tm-grouped: #1c1c1e;
    --tm-muted: rgba(235, 235, 245, 0.6);
  }
}
.tm-anchor {
  position: fixed;
  top: 24px;
  left: 50%;
  z-index: 2147483647;
  width: min(400px, calc(100vw - 32px));
  transform: translateX(-50%);
  pointer-events: none;
  font-family: var(--tm-font);
}

.tm-card {
  position: relative;
  box-sizing: border-box;
  width: 100%;
  padding: 16px 16px 14px;
  background: var(--tm-card);
  color: #fff;
  border-radius: var(--tm-radius);
  box-shadow: var(--tm-shadow);
  pointer-events: auto;
  animation: tm-in 0.28s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.tm-head {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding-right: 28px;
}

.tm-icon {
  display: grid;
  flex: none;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--tm-icon);
  color: #fff;
}

.tm-icon.tm-success {
  background: var(--tm-blue);
}

.tm-title {
  margin: 1px 0 0;
  font-size: 17px;
  font-weight: 600;
  line-height: 22px;
  letter-spacing: -0.02em;
}

.tm-subtitle {
  margin: 2px 0 0;
  color: var(--tm-secondary);
  font-size: 13px;
  line-height: 18px;
  word-break: break-word;
}

.tm-close {
  position: absolute;
  top: 12px;
  right: 12px;
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--tm-secondary);
  cursor: pointer;
}

.tm-close:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}

.tm-track {
  height: 6px;
  margin: 12px 4px 6px 48px;
  overflow: hidden;
  border-radius: 3px;
  background: var(--tm-track);
}

.tm-fill {
  display: block;
  width: 0;
  height: 100%;
  border-radius: 3px;
  background: var(--tm-blue);
  transition: width 0.35s ease;
}

.tm-percent {
  margin: 0 4px 2px 48px;
  color: var(--tm-secondary);
  font-size: 13px;
  line-height: 18px;
}

.tm-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 22px;
  align-items: center;
  margin: 10px 0 2px 48px;
}

.tm-action {
  padding: 6px 0;
  border: 0;
  background: none;
  color: var(--tm-secondary);
  font: inherit;
  font-size: 15px;
  line-height: 20px;
  cursor: pointer;
}

.tm-action.tm-primary {
  color: #fff;
  font-weight: 500;
}

.tm-action:hover,
.tm-pill:hover {
  opacity: 0.82;
}

.tm-pill {
  margin: 12px 0 4px 48px;
  padding: 6px 14px;
  border: 0;
  border-radius: 8px;
  background: var(--tm-pill);
  color: #fff;
  font: inherit;
  font-size: 15px;
  font-weight: 500;
  line-height: 20px;
  cursor: pointer;
}

@keyframes tm-in {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .tm-card {
    animation: none;
  }

  .tm-fill {
    transition: none;
  }
}
`;
})(globalThis);
