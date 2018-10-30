![Logo](admin/surepetcareio.png)
# ioBroker.surepetcareio
=================

This adapter connects a Sureflap pet door connect to IoBroker.

To use it enter your surepetcare.io website or Sureflap Connect app credentials on the settings page.

Currently this only supports one household and one pet door in that household. I have had no time to
do anything else.

The adapter creates one data-point under its instance for each pet. Name and presence information only.

Sample usage in Javascript adapter (send mail if cat enters/exits through door, requires email adapter):

<pre>
function sendNotificationMail(subject, body="")
{
    var d = new Date();
   
    sendTo("email", {
        from:    "from@owner.pet",
        to:      "to@owner.pet",
        subject: "[pet door notification " + d.toString() + "]: " + subject,
        text:    body
    });
}

function catChanged(obj)
{
    console.log(util.inspect(obj, { showHidden: true, depth: null }));
    var name = obj.name;
    if (obj.newState.val === true && obj.state.ack === true) {
        console.log('pet in name: ' + name);
        sendNotificationMail("pet " + name + " inside!", name);
    } else if (obj.newState.val === false  && obj.state.ack === true) {
        console.log('pet out name: ' + name);
        sendNotificationMail("pet " + name + " outside!", name);
    }
}

on(/^surepetcareio\.0\.household.*\.pets\..*$/, catChanged);
</pre>



## License
The MIT License (MIT)

Copyright (c) 2018 Klaus Gerlicher <klaus@klausgerlicher.de>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
