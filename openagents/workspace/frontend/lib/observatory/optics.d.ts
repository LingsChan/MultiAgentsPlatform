interface Viewpoint {
  centerX: number;
  centerY: number;
  incl: number;
  az: number;
  lens: number;
  clock: number;
  zoom: number;
  ev: number;
}

export interface OpticsRenderer {
  fps: number;
  software?: boolean;
  draw(camera: Viewpoint, width: number, height: number): void;
  dispose?(): void;
}

export function blackHoleRenderer(canvas: HTMLCanvasElement, signal: AbortSignal): Promise<OpticsRenderer>;
