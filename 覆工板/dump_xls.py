"""Dump all sheets of an .xls file: values + formulas + interior color."""
import sys
import os
import win32com.client as win32

def dump(path, out_path):
    excel = win32.Dispatch('Excel.Application')
    excel.Visible = False
    excel.DisplayAlerts = False
    wb = excel.Workbooks.Open(os.path.abspath(path), ReadOnly=True)
    lines = []
    lines.append(f"FILE: {path}")
    lines.append(f"Sheets: {wb.Sheets.Count}")
    for sh in wb.Sheets:
        name = sh.Name
        used = sh.UsedRange
        rows = used.Rows.Count
        cols = used.Columns.Count
        r0 = used.Row
        c0 = used.Column
        lines.append("\n" + "="*100)
        lines.append(f"SHEET: {name}  range={used.Address}  rows={rows} cols={cols}")
        lines.append("="*100)
        # Read in bulk for speed
        try:
            vals = used.Value
            forms = used.Formula
        except Exception as e:
            lines.append(f"  read error: {e}")
            continue
        # Normalize to 2D tuple
        if rows == 1 and cols == 1:
            vals = ((vals,),)
            forms = ((forms,),)
        elif rows == 1:
            vals = (vals,)
            forms = (forms,)
        elif cols == 1:
            vals = tuple((v,) for v in vals)
            forms = tuple((f,) for f in forms)
        for i in range(rows):
            for j in range(cols):
                v = vals[i][j]
                f = forms[i][j]
                if v is None and (f is None or f == ''):
                    continue
                cell_addr = sh.Cells(r0+i, c0+j).Address.replace('$','')
                # interior color
                try:
                    color = sh.Cells(r0+i, c0+j).Interior.Color
                except Exception:
                    color = None
                color_tag = ''
                if color and color != 16777215 and color != 0:
                    c = int(color)
                    r = c & 0xFF
                    g = (c >> 8) & 0xFF
                    b = (c >> 16) & 0xFF
                    color_tag = f" [color=#{r:02X}{g:02X}{b:02X}]"
                if isinstance(f, str) and f.startswith('='):
                    lines.append(f"  {cell_addr}{color_tag}  formula={f}  value={v!r}")
                else:
                    lines.append(f"  {cell_addr}{color_tag}  value={v!r}")
    wb.Close(SaveChanges=False)
    excel.Quit()
    with open(out_path, 'w', encoding='utf-8') as fp:
        fp.write('\n'.join(lines))
    print(f"wrote {out_path}  lines={len(lines)}")

if __name__ == '__main__':
    src = sys.argv[1]
    dst = sys.argv[2]
    dump(src, dst)
