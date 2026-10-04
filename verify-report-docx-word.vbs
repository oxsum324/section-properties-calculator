On Error Resume Next
Dim filePath, expectedTables, word, document
filePath = WScript.Arguments(0)
expectedTables = CInt(WScript.Arguments(1))
Set word = CreateObject("Word.Application")
If Err.Number <> 0 Then
  WScript.Echo "WORD_CREATE_FAILED " & Err.Number & ":" & Err.Description
  WScript.Quit 2
End If
word.Visible = False
word.DisplayAlerts = 0
Set document = word.Documents.OpenNoRepairDialog(filePath, False, True, False)
If Err.Number <> 0 Then
  WScript.Echo "WORD_OPEN_NO_REPAIR_FAILED " & Err.Number & ":" & Err.Description
  word.Quit 0
  WScript.Quit 3
End If
If document.Content.Characters.Count <= 1 Then
  WScript.Echo "WORD_OPEN_EMPTY " & document.Name
  document.Close 0
  word.Quit 0
  WScript.Quit 4
End If
If document.Tables.Count <> expectedTables Then
  WScript.Echo "WORD_TABLE_COUNT_MISMATCH " & document.Name & " expected=" & expectedTables & " actual=" & document.Tables.Count
  document.Close 0
  word.Quit 0
  WScript.Quit 5
End If
If document.SaveFormat <> 12 Then
  WScript.Echo "WORD_FORMAT_MISMATCH " & document.Name & " saveFormat=" & document.SaveFormat
  document.Close 0
  word.Quit 0
  WScript.Quit 6
End If
WScript.Echo "WORD_OPEN_NO_REPAIR_OK " & document.Name & " tables=" & document.Tables.Count & " chars=" & document.Content.Characters.Count
document.Close 0
word.Quit 0
