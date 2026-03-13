

this should be a local tool for creating rdf graphs out of json files with data.
The user can have multiple workspaces. A workspace is a specific folder on the pc.
In a workspace there should only be files json files (and markdonw is also okay). 
The app ready all json files. These json files have to be structured in a specific way:
{datasetName: "...", description: "...", source: "...", data: [ {id: , attributes} ]}

If not it should show the file but with an error indicator for this dataset of malformed json.

Attributes can be a belibiege amound and kind of attributes.
Also in the json all data entries must have exact the same structure. (all have same attibutes, it is mandetoty.)
else also show error.

the user should be able to browser his datasets (and edit them) .
this means adding attributes. removing attributes or editing values of single entries.

for the start this should be good.
