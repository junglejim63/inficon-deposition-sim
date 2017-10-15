# inficon-deposition-sim
Serial simulator for Inficon XTM/2 Deposition Monitor

The [Inficon XTM/2 Deposition Monitor](http://products.inficon.com/GetAttachment.axd?attaName=b9bd8067-fbd1-43da-9ba9-1a016d559b04 "Deposition Monitor Manual") is a precise instrument which measures material deposition in a sputtering machine by detecting resonance change of a crystal during deposition.

Communication is via RS232, and while the instrument supports multiple protocols (IEE, SEMS, RS232 with and without checksum), this simulator is only programmed to accurately simulate the following:
* RS232 without checksum - polled response only
* Polled ~500ms
  * S 1 to get thickness
  * S 2 to get deposition rate
* At setup
  * Query tooling (Q 0), density (Q 3), and Z-ratio (Q 4) of all 9 films
  * Set tooling (U 0), density (U 3), and Z-ratio (U 4) of all 9 films
  * Select the film number to use (U 6)
  * Zero the reading to start a run (R 4 and R 5)
  * Lock out the front panel (R 3 and R 2)

### Command Structure

#### Supported COM parameters
Instrument is DCE, but simulator is running on DTE, so need crossover null modem between master DTE and simulated system, but straight through for connection to real device. Supported baud rates are 1200, 2400, 4800, and 9600. Parameters: N,8,1,CS,DS

#### Supported commands:
* E: Echo. Returns the last sent message.
* H: Hello. Returns the model and software version number, like "XTM/2 VERSION x.xx".
* Q: Query. Interrogates the programmable parameters and returns the
value of parameter requested.
* U: Update. Replaces the particular parameter with the value sent.
* S: Status. Sends back pertinent information based on the specific
request made.
* R: Remote. Perform an action based on the specific command given.
Many of these mimic front panel keystrokes.

#### Non-checksum Format

| Direction | Format |
| --- | --- |
| To XTM/2 |  message_string ACK |
| From XTM/2 |  message_string ACK (if successful) <br>error_code NACK (if unsuccessful)  |

#### Error Codes
* A: Illegal command
* B: Illegal Value
* C: Illegal ID
* D: Illegal command format
* E: No data to retrieve
* F: Cannot change value now
* G: Bad checksum

#### Query (Q) and Update (U) Format
Query and Update follow the format "Q P F" or "U P F vvv.vvv" where P is parameter from the table below, F is film number 1-9, and vvv.vvv is value as per table:

| Parameter | XTC/2 Parameter Range |
| --- | --- |
| 0 | Tooling 10 to 500.9 (%) |
| 1 | Final Thickness 0 to 999.9999 (kÅ/μgm/mgm) |
| 2 | SPT Thickness 0 to 999.9999 (kÅ/μgm/mgm) |
| 3 | Density 0.5 to 99.999 (gm/cc) |
| 4 | Z-ratio 0.1 to 9.999 |
| 5 | SPT Time 00:00 to 99:59 (min:sec) |
| 6 | Current Film Number 1-9<br>Format of command varies:<br>Q 6, no F<br>U 6 F to set current film number|
| 99 | Queries or Updates parameters 0-5 for film F <br>Returned values are space delimited.  All parameters must be sent for Update.|

#### Status (S) Commands
Status commands follow the pattern S P and return various values depending on the command:

| Parameter | Description | Return Value |
| --- | --- | --- |
| 0 | Rate, Thickness, Time, Xtal-Life | Space delimited in format below |
| 1 | Rate | _ _ _.__Å/s [or ngm/sec or μgm/sec] |
| 2 | Thickness | _ _ _ _._ _ _ _ kÅ [or μgm or mgm] |
| 3 | Deposit Time | _ _:_ _ Min:Sec |
| 4 | Film | 1-9 |
| 5 | Crystal life (%) | _ _% |
| 6 | Output Status | 8 ASCII bytes, 1=closed contacts, 0=open<br>Only last 4 bytes represent outputs (4-1)<ul><li>4=Sensor Fail</li><li>3=Timer SPT</li><li>2=Thick SPT</li><li>1=Source Shutter</li></ul>Ex: "00001100" => outputs 4&3 on, 2&1 off |
| 7 | Input Status | 8 ASCII bytes, 1=active (grounded), 0=inactive (pulled high)<br>Only last 5 bytes represent inputs (5-1)<ul><li>5=Crystal Fail Inhibit</li><li>4=Zero Timer</li><li>3=Zero Thickness</li><li>2=Close Shutter</li><li>1=Open Shutter</li></ul>Ex: "00001100" => inputs 4&3 on, 5&2&1 off |
| 8 | Present Frequency of Crystal | Sxxxxxx.xD where<br>x is any digit 0 to 9<br>S character is a space when good readings are available or a negative sign for failed crystals<br>D character is:<ul><li>0 when there is 0.25 second averaging</li><li>0 or 5 when there is 1 second averaging</li><li>Even Digit when there is 4 second averaging</li><li>x when there is 16 second averaging</li></ul> |
| 9 | Crystal Fail | 1 = Fail, 0 = Good |
| 10 | Configuration Switch Settings | 16 ASCII bytes with a value of 0 or 1, corresponding to the position of switches 1-16. Byte 1 corresponds to switch 1 |
| 11 | Power-up Errors | Return values are space delimited errors:<ul><li>0=Parameter data checksum error—indicates a loss of stored parameter data.</li><li>1=STBY/ON sequence since last query—the front panel power switch has been used since the last inquiry (reset by reading status).</li><li>2=Line power failure.</li><li>9=Process data checksum error—indicates a loss of process data.</li><li>10=No errors.</li></ul> |
| 12 | Datalog Output | Datalog output, see section 3.8.4 on page 3-21. The data is separated by a space instead of CR LF |
| 13 | Instrument Configuration | 16 ASCII bytes with a value of 0 or 1, corresponding to the position of switches 1-16. Byte 1 corresponds to switch 1 |

#### Remote (R) commands
Remote commands follow pattern R P n, where P is parameter as described below and n is value required (only some commands require value):

| Parameter | Description | n | Return Value |
| --- | --- | --- |
| 0 | Open Shutter | N/A | ACK only |
| 1 | Close Shutter | N/A | ACK only |
| 2 | Locks out parameters via the front panel | N/A | ACK only |
| 3 | Unlocks parameter changes via the front panel | N/A | ACK only |
| 4 | Zeros Thickness accumulation | N/A | ACK only |
| 5 | Zeros Timer | N/A | ACK only |
| 6 | Output override on. [Allows external control of relays.] | N/A | ACK only |
| 7 | Output override off. | N/A | ACK only |
| 8 | Set output # (if output override on). [Closes Relay #, see section 3.7.1 on page 3-14.] | Output Number | ACK only |
| 9 | Clears output # (if output override on). | Output Number | ACK only |
| 10 | Clear power up error messages. | N/A | ACK only |
| 23 | Set "250ms Data Ready" Service request (IEEE only). | N/A | ACK only |
| 24 | Clear "250ms Data Ready" Service request (IEEE only). | N/A | ACK only |
