using System;
using System.IO;
using System.Linq;
using ETABSv1;

// A new, standalone model carries only the column and its exchange properties.
public static class TeaspaExchange {
    const string PropertyTable = "Hinge Definitions - Interacting PM3";
    const string EndTable = "Frame Assignments - Hinge - User";
    public sealed class ModelReadback {
        public string version, units, frame;
        public double widthCm, depthCm, clearCm, i33Cm4, i22Cm4;
        public int propertyTableVersion, assignmentTableVersion, hingeCount, framesBeforeReopen;
        public double[] axes, hingeRD;
    }
    static void Check(string operation, int rc) {
        if (rc != 0) throw new InvalidOperationException(operation + " returned " + rc);
    }
    static void Import(cDatabaseTables db, string table, string input, TextWriter log) {
        int version = 0, count = 0;
        string[] currentKeys = null, old = null;
        Check("Edit " + table, db.GetTableForEditingArray(table, "", ref version, ref currentKeys, ref count, ref old));
        var lines = File.ReadAllLines(input);
        var keys = lines[0].Split('\t');
        var rows = lines.Skip(1).Select(line => line.Split('\t')).ToArray();
        if (rows.Length == 0 || rows.Any(row => row.Length != keys.Length)) throw new InvalidDataException(input);
        var values = rows.SelectMany(row => row).ToArray();
        Check("Set " + table, db.SetTableForEditingArray(table, ref version, ref keys, rows.Length, ref values));
        int fatal = 0, errors = 0, warnings = 0, info = 0;
        string report = "";
        int rc = db.ApplyEditedTables(true, ref fatal, ref errors, ref warnings, ref info, ref report);
        log.WriteLine(report); log.Flush();
        Check("Apply " + table, rc);
        if (fatal + errors + warnings != 0) throw new InvalidDataException("ETABS reported import diagnostics; see import.log.");
    }
    static int ReadTable(cDatabaseTables db, string table, string output) {
        int version = 0, count = 0;
        string[] requested = null, keys = null, values = null;
        Check("Read " + table, db.GetTableForDisplayArray(table, ref requested, "", ref version, ref keys, ref count, ref values));
        if (keys == null || keys.Length == 0 || count == 0 || values.Length != keys.Length * count) throw new InvalidDataException(table);
        using (var writer = File.CreateText(output)) {
            writer.WriteLine(String.Join("\t", keys));
            for (int i = 0; i < count; i++) writer.WriteLine(String.Join("\t", values.Skip(i * keys.Length).Take(keys.Length)));
        }
        return version;
    }
    static double[] Coordinates(cPointObj points, string id) {
        double x=0, y=0, z=0;
        Check("Joint coordinates", points.GetCoordCartesian(id, ref x, ref y, ref z, "Global"));
        return new double[]{x,y,z};
    }
    public static ModelReadback Run(string exe, string folder, double width, double depth, double height) {
        var model = new ModelReadback();
        model.version = System.Diagnostics.FileVersionInfo.GetVersionInfo(exe).FileVersion;
        if (model.version != "22.3.0.3775") throw new InvalidOperationException("Expected ETABS 22.3.0.3775; found " + model.version);
        string deliverable = Path.Combine(folder,"hinge-exchange.edb");
        if (File.Exists(deliverable)) throw new IOException("Model already exists: " + deliverable);
        // Keep CAD sidecar files separate from the delivered model and readback.
        string work = Path.Combine(Path.GetTempPath(), "teaspa-pm3-" + Guid.NewGuid().ToString("N"));
        string edb = Path.Combine(work,"hinge-exchange.edb");
        Directory.CreateDirectory(work);
        cHelper helper = new Helper();
        cOAPI app = helper.CreateObject(exe);
        try {
            Check("Start ETABS", app.ApplicationStart());
            app.Hide();
            var m = app.SapModel;
            Check("Initialize", m.InitializeNewModel(eUnits.kgf_cm_C));
            Check("Grid", m.File.NewGridOnly(1,height,height,2,2,400,400));
            Check("Set units", m.SetPresentUnits(eUnits.kgf_cm_C));
            Check("Test material", m.PropMaterial.SetMaterial("EXCHANGE-CONCRETE",eMatType.Concrete,-1,"",""));
            // TEASPA width b' is along local 2. CSI's t3 dimension lies along local 2.
            Check("Rectangle", m.PropFrame.SetRectangle("EXCHANGE-RECT","EXCHANGE-CONCRETE",width,depth,-1,"",""));
            string frame = "";
            Check("Column", m.FrameObj.AddByCoord(0,0,0,0,0,height,ref frame,"EXCHANGE-RECT","C1","Global"));
            if (frame != "C1") throw new InvalidOperationException("Unexpected frame name: " + frame);
            using (var log = File.CreateText(Path.Combine(folder,"import.log"))) {
                Import(m.DatabaseTables,PropertyTable,Path.Combine(folder,"pm3.tsv"),log);
                Import(m.DatabaseTables,EndTable,Path.Combine(folder,"assign.tsv"),log);
            }
            Check("Save", m.File.Save(edb));
            if (!File.Exists(edb) || new FileInfo(edb).Length == 0) throw new IOException("Missing saved model.");
            Check("Clear model", m.InitializeNewModel(eUnits.kgf_cm_C));
            Check("Blank model", m.File.NewBlank());
            int frameCount = 0; string[] emptyNames = null;
            Check("Confirm empty model", m.FrameObj.GetNameList(ref frameCount,ref emptyNames));
            if (frameCount != 0) throw new InvalidDataException("Model did not clear before readback.");
            model.framesBeforeReopen = frameCount;
            Check("Reopen", m.File.OpenFile(edb));
            Check("Readback units", m.SetPresentUnits(eUnits.kgf_cm_C));
            model.units = m.GetPresentUnits().ToString();
            model.frame = frame;
            model.propertyTableVersion = ReadTable(m.DatabaseTables,PropertyTable,Path.Combine(folder,"hinges-reopened.tsv"));
            model.assignmentTableVersion = ReadTable(m.DatabaseTables,EndTable,Path.Combine(folder,"assignments-reopened.tsv"));
            Check("Reopened axes",m.FrameObj.GetTransformationMatrix(frame,ref model.axes,true));
            string sec="", auto="", filename="", material="", note="", guid="";
            int color=0;
            Check("Assigned section",m.FrameObj.GetSection(frame,ref sec,ref auto));
            Check("Rectangle dimensions",m.PropFrame.GetRectangle(sec,ref filename,ref material,ref model.widthCm,ref model.depthCm,ref color,ref note,ref guid));
            double area=0, as2=0, as3=0, torsion=0, s22=0, s33=0, z22=0, z33=0, r22=0, r33=0;
            Check("Section inertias",m.PropFrame.GetSectProps(sec,ref area,ref as2,ref as3,ref torsion,ref model.i22Cm4,ref model.i33Cm4,ref s22,ref s33,ref z22,ref z33,ref r22,ref r33));
            string i="", j="";
            Check("Frame ends", m.FrameObj.GetPoints(frame,ref i,ref j));
            var a = Coordinates(m.PointObj,i); var b = Coordinates(m.PointObj,j);
            if (Math.Abs(b[0]-a[0])+Math.Abs(b[1]-a[1])>1e-8 || b[2]<=a[2]) throw new InvalidDataException("Expected bottom-to-top vertical frame.");
            bool autoOffset=false; double li=0, lj=0, rigid=0;
            Check("End offsets",m.FrameObj.GetEndLengthOffset(frame,ref autoOffset,ref li,ref lj,ref rigid));
            model.clearCm=b[2]-a[2]-li-lj;
            int[] numbers=null,types=null,behaviors=null; string[] properties=null,sources=null;
            Check("Independent hinge locations",m.FrameObj.GetHingeAssigns(frame,ref model.hingeCount,ref numbers,ref properties,ref types,ref behaviors,ref sources,ref model.hingeRD));
            Array.Sort(model.hingeRD);
            File.Copy(edb,deliverable,false);
            return model;
        } finally {
            Check("Exit standalone ETABS",app.ApplicationExit(false));
            // This newly created GUID directory contains only this instance's scratch files.
            Directory.Delete(work,true);
        }
    }
}
