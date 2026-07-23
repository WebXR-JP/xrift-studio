declare module "draco3dgltf/draco_encoder_gltf_nodejs.js" {
  type DracoEncoderModuleOptions = {
    wasmBinary?: Uint8Array;
  };

  type DracoEncoderModuleFactory = (
    options?: DracoEncoderModuleOptions,
  ) => Promise<object>;

  const createEncoderModule: DracoEncoderModuleFactory;
  export default createEncoderModule;
}
