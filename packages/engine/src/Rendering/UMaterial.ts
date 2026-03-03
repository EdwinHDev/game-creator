import { UObject } from '../Core/UObject';

/**
 * Represents a material that can be applied to a mesh.
 * Currently supports a basic RGBA base color.
 */
export class UMaterial extends UObject {
  /**
   * The base color of the material (RGBA).
   * Values are normalized (0.0 to 1.0).
   */
  public baseColor: Float32Array = new Float32Array([1.0, 1.0, 1.0, 1.0]);

  /**
   * Surface roughness (0.0 = smooth, 1.0 = rough).
   */
  public roughness: number = 0.5;

  /**
   * Metalness (0.0 = dielectric, 1.0 = metallic).
   */
  public metallic: number = 0.0;

  constructor(name: string = 'Material') {
    super(name);
  }
}
