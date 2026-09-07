from pathlib import Path
import sys,math
import numpy as np
import vtk
from vtk.util.numpy_support import numpy_to_vtk

def render(path,out,size=720):
    win=vtk.vtkRenderWindow();win.SetOffScreenRendering(1);win.SetSize(size,size);win.SetMultiSamples(4)
    ren=vtk.vtkRenderer();win.AddRenderer(ren)
    imp=vtk.vtkGLTFImporter();imp.SetFileName(str(path));imp.SetRenderWindow(win);imp.Update()
    ren=win.GetRenderers().GetFirstRenderer()
    bounds=ren.ComputeVisiblePropBounds();lo=np.array([bounds[0],bounds[2],bounds[4]]);hi=np.array([bounds[1],bounds[3],bounds[5]])
    ctr=(lo+hi)/2;maxdim=max(hi-lo); floor=lo[1]-.005
    ren.SetBackground(.135,.15,.17)
    # Neutral studio illumination for actual imported GLB geometry.
    env=np.ones((128,256,3),dtype=np.float32)*np.array([.19,.205,.23],np.float32)
    yy,xx=np.mgrid[0:128,0:256]
    env+=np.exp(-((xx-40)/25)**8-((yy-45)/20)**8)[...,None]*np.array([2.2,2.05,1.83])
    env+=np.exp(-((xx-180)/18)**8-((yy-52)/35)**8)[...,None]*np.array([.8,.9,1.2])
    image=vtk.vtkImageData();image.SetDimensions(256,128,1);a=numpy_to_vtk(env.reshape(-1,3),deep=True);image.GetPointData().SetScalars(a)
    tex=vtk.vtkTexture();tex.SetInputData(image);tex.SetColorModeToDirectScalars();tex.InterpolateOn();tex.MipmapOn()
    ren.UseImageBasedLightingOn();ren.SetEnvironmentTexture(tex);ren.AutomaticLightCreationOff()
    for p,power,col in [((3,5,4),2.1,(1,.93,.83)),((-4,2,1),.85,(.72,.83,1)),((1,4,-5),1.2,(1,1,1))]:
        l=vtk.vtkLight();l.SetLightTypeToSceneLight();l.SetPosition(*(ctr+np.array(p)*maxdim));l.SetFocalPoint(*ctr);l.SetIntensity(power);l.SetColor(*col);ren.AddLight(l)
    plane=vtk.vtkPlaneSource();w=maxdim*100;plane.SetOrigin(-w,floor,-w);plane.SetPoint1(-w,floor,w);plane.SetPoint2(w,floor,-w)
    mapper=vtk.vtkPolyDataMapper();mapper.SetInputConnection(plane.GetOutputPort());actor=vtk.vtkActor();actor.SetMapper(mapper);actor.GetProperty().SetColor(.20,.22,.245);actor.GetProperty().SetInterpolationToPBR();actor.GetProperty().SetRoughness(.95);ren.AddActor(actor)
    basic=vtk.vtkRenderStepsPass();ao=vtk.vtkSSAOPass();ao.SetDelegatePass(basic);ao.SetRadius(maxdim*.12);ao.SetBias(maxdim*.004);ao.SetKernelSize(128);ao.BlurOn();ren.SetPass(ao)
    camera=ren.GetActiveCamera();camera.SetPosition(*(ctr+np.array([1.18,.8,1.7])*maxdim));camera.SetFocalPoint(*ctr);camera.SetViewUp(0,1,0);camera.ParallelProjectionOn();camera.SetParallelScale(maxdim*.69)
    if path.stem == 'recording-studio':
        camera.ParallelProjectionOff();camera.SetViewAngle(76)
        camera.SetPosition(1.48,1.55,1.20);camera.SetFocalPoint(-.35,1.05,-1.15)
    ren.ResetCameraClippingRange();win.Render()
    wti=vtk.vtkWindowToImageFilter();wti.SetInput(win);wti.ReadFrontBufferOff();wti.Update()
    writer=vtk.vtkPNGWriter();writer.SetFileName(str(out));writer.SetInputConnection(wti.GetOutputPort());writer.Write();win.Finalize()
    print('Rendered',path,'->',out,flush=True)
if __name__=='__main__':render(Path(sys.argv[1]),Path(sys.argv[2]),int(sys.argv[3]) if len(sys.argv)>3 else 720)
