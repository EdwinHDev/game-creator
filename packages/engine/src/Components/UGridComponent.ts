import { UActorComponent } from '../Framework/UActorComponent';
import { AActor } from '../Framework/AActor';
import { vec4 } from 'gl-matrix';

/**
 * Component that manages the properties of the world grid.
 * Although it's an infinite procedural grid, this component provides
 * the parameters for the shader.
 */
export class UGridComponent extends UActorComponent {
  /**
   * Size of the main grid cells in centimeters (or units).
   */
  public gridSize: number = 100.0;

  /**
   * Color of the grid lines.
   */
  public gridColor: vec4 = vec4.fromValues(0.5, 0.5, 0.5, 1.0);

  /**
   * Whether the grid should extend infinitely or be bounded.
   */
  public bIsInfinite: boolean = true;

  /**
   * Overall opacity of the grid.
   */
  public opacity: number = 0.8;

  constructor(owner: AActor, name: string = 'GridComponent') {
    super(owner, name);
  }

  /**
   * Serializes the grid component data.
   */
  public serialize(): any {
    return {
      name: this.name,
      gridSize: this.gridSize,
      gridColor: Array.from(this.gridColor),
      bIsInfinite: this.bIsInfinite,
      opacity: this.opacity
    };
  }

  /**
   * Deserializes the grid component data.
   */
  public deserialize(data: any): void {
    if (data.name) this.name = data.name;
    if (data.gridSize !== undefined) this.gridSize = data.gridSize;
    if (data.gridColor) vec4.copy(this.gridColor, new Float32Array(data.gridColor));
    if (data.bIsInfinite !== undefined) this.bIsInfinite = data.bIsInfinite;
    if (data.opacity !== undefined) this.opacity = data.opacity;
  }
}

