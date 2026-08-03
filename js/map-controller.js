export class MapController {
  constructor(viewport) {
    this.viewport = viewport;
    this.svg = null;
    this.mapContent = null;
    this.transform = { x: 0, y: 0, scale: 1 };
    this.minScale = 1;
    this.maxScale = 4;
    this.fitScale = 1;
    this.fitCenter = { x: 600, y: 400 };
    this.mapWidth = 1200;
    this.mapHeight = 800;
    this.dragThreshold = 6;
    this.pointers = new Map();
    this.dragStart = null;
    this.pinchStart = null;
    this.press = null;
    this.onActivate = null;
    this.pointerTarget = null;
    this.boundPointerDown = (event) => this.onPointerDown(event);
    this.boundPointerMove = (event) => this.onPointerMove(event);
    this.boundPointerEnd = (event) => this.onPointerEnd(event);
    this.boundWheel = (event) => this.onWheel(event);
  }

  setMap(svg, mapContent, onActivate) {
    this.removePointerEvents();
    this.svg = svg;
    this.mapContent = mapContent;
    this.onActivate = onActivate;
    this.pointerTarget = svg;
    svg.addEventListener('pointerdown', this.boundPointerDown);
    svg.addEventListener('pointermove', this.boundPointerMove);
    svg.addEventListener('pointerup', this.boundPointerEnd);
    svg.addEventListener('pointercancel', this.boundPointerEnd);
    svg.addEventListener('wheel', this.boundWheel, { passive: false });
    this.reset();
  }

  removePointerEvents() {
    if (!this.pointerTarget) return;
    this.pointerTarget.removeEventListener('pointerdown', this.boundPointerDown);
    this.pointerTarget.removeEventListener('pointermove', this.boundPointerMove);
    this.pointerTarget.removeEventListener('pointerup', this.boundPointerEnd);
    this.pointerTarget.removeEventListener('pointercancel', this.boundPointerEnd);
    this.pointerTarget.removeEventListener('wheel', this.boundWheel);
    this.resetInteraction();
  }

  getSvgPoint(event) {
    const point = this.svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    return point.matrixTransform(this.svg.getScreenCTM().inverse());
  }

  getCenterPoint() {
    const bounds = this.svg.getBoundingClientRect();
    return this.getSvgPoint({ clientX: bounds.left + bounds.width / 2, clientY: bounds.top + bounds.height / 2 });
  }

  onWheel(event) {
    event.preventDefault();
    this.zoomBy(event.deltaY < 0 ? 1.15 : 1 / 1.15, this.getSvgPoint(event));
  }

  onPointerDown(event) {
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const point = this.getSvgPoint(event);
    this.pointers.set(event.pointerId, { point, clientX: event.clientX, clientY: event.clientY });
    this.svg.classList.add('is-dragging');

    if (this.pointers.size === 1) {
      this.dragStart = { point, x: this.transform.x, y: this.transform.y, clientX: event.clientX, clientY: event.clientY };
      this.press = {
        pointerId: event.pointerId,
        attraction: event.target.closest?.('[data-attraction-id]') ?? null,
        dragged: false
      };
    } else if (this.pointers.size === 2) {
      if (this.press) this.press.dragged = true;
      const [a, b] = [...this.pointers.values()].map((pointer) => pointer.point);
      this.pinchStart = {
        distance: Math.hypot(b.x - a.x, b.y - a.y),
        center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        x: this.transform.x,
        y: this.transform.y,
        scale: this.transform.scale
      };
    }
  }

  onPointerMove(event) {
    if (!this.pointers.has(event.pointerId)) return;
    event.preventDefault();
    const currentPoint = this.getSvgPoint(event);
    this.pointers.set(event.pointerId, { point: currentPoint, clientX: event.clientX, clientY: event.clientY });

    if (this.pointers.size === 2 && this.pinchStart) {
      const [a, b] = [...this.pointers.values()].map((pointer) => pointer.point);
      const distance = Math.hypot(b.x - a.x, b.y - a.y);
      const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const scale = this.clampScale(this.pinchStart.scale * distance / this.pinchStart.distance);
      const ratio = scale / this.pinchStart.scale;
      this.transform.scale = scale;
      this.transform.x = center.x - (this.pinchStart.center.x - this.pinchStart.x) * ratio;
      this.transform.y = center.y - (this.pinchStart.center.y - this.pinchStart.y) * ratio;
      this.applyTransform();
      return;
    }

    if (this.pointers.size === 1 && this.dragStart) {
      const screenDistance = Math.hypot(event.clientX - this.dragStart.clientX, event.clientY - this.dragStart.clientY);
      if (screenDistance <= this.dragThreshold) return;
      if (this.press) this.press.dragged = true;
      this.transform.x = this.dragStart.x + currentPoint.x - this.dragStart.point.x;
      this.transform.y = this.dragStart.y + currentPoint.y - this.dragStart.point.y;
      this.applyTransform();
    }
  }

  onPointerEnd(event) {
    const shouldActivate = event.type === 'pointerup'
      && this.pointers.size === 1
      && this.press?.pointerId === event.pointerId
      && !this.press.dragged
      && this.press.attraction;

    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    this.pointers.delete(event.pointerId);
    this.pinchStart = null;
    this.dragStart = null;
    this.press = null;

    if (event.type === 'pointercancel') this.pointers.clear();
    if (this.pointers.size === 0) this.svg.classList.remove('is-dragging');
    if (shouldActivate) this.onActivate?.(shouldActivate.dataset.attractionId);
  }

  resetInteraction() {
    this.pointers.clear();
    this.dragStart = null;
    this.pinchStart = null;
    this.press = null;
    this.svg?.classList.remove('is-dragging');
  }

  clampScale(scale) {
    return Math.min(this.maxScale, Math.max(this.minScale, scale));
  }

  zoomBy(factor, center = this.fitCenter) {
    if (!this.mapContent) return;
    const scale = this.clampScale(this.transform.scale * factor);
    const ratio = scale / this.transform.scale;
    this.transform.x = center.x - (center.x - this.transform.x) * ratio;
    this.transform.y = center.y - (center.y - this.transform.y) * ratio;
    this.transform.scale = scale;
    this.applyTransform();
  }

  reset() {
    this.fitMapToViewport();
  }

  fitMapToViewport() {
    if (!this.svg || !this.mapContent) return;
    const bounds = this.viewport.getBoundingClientRect();
    const visualViewport = window.visualViewport;
    const viewportLeft = visualViewport?.offsetLeft ?? 0;
    const viewportTop = visualViewport?.offsetTop ?? 0;
    const viewportRight = viewportLeft + (visualViewport?.width ?? window.innerWidth);
    const viewportBottom = viewportTop + (visualViewport?.height ?? window.innerHeight);
    const footer = document.querySelector('#app-version')?.getBoundingClientRect();

    const visibleLeft = Math.max(bounds.left, viewportLeft);
    const visibleTop = Math.max(bounds.top, viewportTop);
    const visibleRight = Math.min(bounds.right, viewportRight);
    let visibleBottom = Math.min(bounds.bottom, viewportBottom);
    if (footer && footer.top < visibleBottom) visibleBottom = Math.max(visibleTop, footer.top - 4);

    const availableWidth = Math.max(1, visibleRight - visibleLeft);
    const availableHeight = Math.max(1, visibleBottom - visibleTop);
    const offsetX = visibleLeft - bounds.left;
    const offsetY = visibleTop - bounds.top;

    this.svg.setAttribute('viewBox', `0 0 ${bounds.width} ${bounds.height}`);
    this.svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    this.fitScale = Math.min(availableWidth / this.mapWidth, availableHeight / this.mapHeight);
    this.minScale = this.fitScale;
    this.maxScale = this.fitScale * 4;
    const x = offsetX + (availableWidth - this.mapWidth * this.fitScale) / 2;
    const y = offsetY + (availableHeight - this.mapHeight * this.fitScale) / 2;
    this.fitCenter = { x: offsetX + availableWidth / 2, y: offsetY + availableHeight / 2 };
    this.transform = { x, y, scale: this.fitScale };
    this.applyTransform();
  }

  focusAt(x, y) {
    if (!this.svg) return;
    const center = this.fitCenter;
    this.transform.scale = Math.max(this.transform.scale, this.fitScale * 1.15);
    this.transform.x = center.x - x * this.transform.scale;
    this.transform.y = center.y - y * this.transform.scale;
    this.applyTransform();
  }

  applyTransform() {
    if (!this.mapContent) return;
    const { x, y, scale } = this.transform;
    this.mapContent.setAttribute('transform', `translate(${x} ${y}) scale(${scale})`);
  }
}
