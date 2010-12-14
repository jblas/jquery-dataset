/*
* jQuery Data Set Framework : dataset plugin
* Copyright (c) 2010 Adobe Systems Incorporated - Kin Blas (jblas@adobe.com)
* Dual licensed under the MIT (MIT-LICENSE.txt) and GPL (GPL-LICENSE.txt) licenses.
* Note: Code is in draft form and is subject to change 
*/

(function($,window,document,undefined){

////////// Notifier //////////

function Notifier()
{
	this._nObservers = {};
	this._nLock = 0;
}

$.extend(Notifier.prototype, {
	bind: function(eventName, func)
	{
		var a = this._nObservers[eventName];
		if (!a) {
			a = obs[eventName] = {};
		}
		for (var i = 0; i < a.length; i++) {
			if (a[i] == func) {
				return;
			}
		}
		a.unshift(func);
	},

	unbind: function(eventName, func)
	{
		var a = this._nObservers[eventName];
		if (a) {
			for (var i = 0; i < a.length; i++) {
				if (a[i] == func) {
					this._nObservers.splice(i, 1);
					return;
				}
			}
		}
	},

	trigger: function(eventName, data)
	{
		if (!this._nLock) {
			var obs = this._nObservers[eventName];
			if (obs) {
				var cnt = obs.length;
				for (var i = cnt - 1; i >= 0; --i) {
					var f = obs[i];
					if (f) {
						f(eventName, data);
					}
				}
			}
		}
	},

	enableTrigger: function()
	{
		if (--this._nLock <= 0) {
			this._nLock = 0;
		}
	},

	disableTrigger: function()
	{
		++this._nLock;
	}
});

////////// DataSet //////////

var nextDataSetID = 0;

function DataSet(opts)
{
	Notifier.call(this);

	this.name = "";
	this.internalID = nextDataSetID++;
	this.curRowID = 0;
	this.data = [];
	this.unfilteredData = null;
	this.dataHash = {};
	this.columnTypes = {};
	this.filterFunc = null;		// non-destructive filter function
	this.filterDataFunc = null;	// destructive filter function

	this.distinctOnLoad = false;
	this.distinctFieldsOnLoad = null;
	this.sortOnLoad = null;
	this.sortOrderOnLoad = "ascending";
	this.keepSorted = false;

	this.dataWasLoaded = false;
	this.pendingRequest = null;

	this.lastSortColumns = [];
	this.lastSortOrder = "";

	this.loadIntervalID = 0;

	$.extend(this, options);
}

$.extend(DataSet.prototype, Notifier.prototype, {
	getData: function(unfiltered)
	{
		return (unfiltered && this.unfilteredData) ? this.unfilteredData : this.data;
	},

	getUnfilteredData: function()
	{
		// XXX: Deprecated.
		return this.getData(true);
	},

	getLoadDataRequestIsPending: function()
	{
		return this.pendingRequest != null;
	},

	getDataWasLoaded: function()
	{
		return this.dataWasLoaded;
	},

	getValue: function(valueName, rowContext)
	{
		var result = undefined;
	
		// If a rowContext is not defined, we default to
		// using the current row.
	
		if (!rowContext)
			rowContext = this.getCurrentRow();
	
		switch(valueName)
		{
			case "ds_RowNumber":
				result = this.getRowNumber(rowContext);
				break;
			case "ds_RowNumberPlus1":
				result = this.getRowNumber(rowContext) + 1;
				break;
			case "ds_RowCount":
				result = this.getRowCount();
				break;
			case "ds_UnfilteredRowCount":
				result = this.getRowCount(true);
				break;
			case "ds_CurrentRowNumber":
				result = this.getCurrentRowNumber();
				break;
			case "ds_CurrentRowID":
				result = this.getCurrentRowID();
				break;
			case "ds_EvenOddRow":
				result = (this.getRowNumber(rowContext) % 2) ? "even" : "odd";
				break;
			case "ds_SortOrder":
				result = this.getSortOrder();
				break;
			case "ds_SortColumn":
				result = this.getSortColumn();
				break;
			default:
				// We have an unknown value, check to see if the current
				// row has column value that matches the valueName.
				if (rowContext)
					result = rowContext[valueName];
				break;
		}
	
		return result;
	},

	setDataFromArray: function(arr, fireSyncLoad)
	{
		this.trigger("onPreLoad");
	
		this.unfilteredData = null;
		this.filteredData = null;
		this.data = [];
		this.dataHash = {};
	
		var arrLen = arr.length;
	
		for (var i = 0; i < arrLen; i++)
		{
			var row = arr[i];
			if (row.ds_RowID == undefined)
				row.ds_RowID = i;
			this.dataHash[row.ds_RowID] = row;
			this.data.push(row);
		}
	
		this.loadData(fireSyncLoad);
	},

	loadData: function(syncLoad)
	{
		// The idea here is that folks using the base class DataSet directly
		// would change the data in the DataSet manually and then call loadData()
		// to fire off an async notifications to say that it was ready for consumption.
		//
		// Firing off data changed notificataions synchronously from this method
		// can wreak havoc with complicated master/detail regions that use data sets
		// that have master/detail relationships with other data sets. Our data set
		// logic already handles async data loading nicely so we use a timer to fire
		// off the data changed notification to insure that it happens after this
		// function is finished and the JS stack unwinds.
		//
		// Other classes that derive from this class and load data synchronously
		// inside their loadData() implementation should also fire off an async
		// notification in this same manner to avoid this same problem.
	
		var self = this;
	
		this.pendingRequest = new Object;
	
		this.dataWasLoaded = false;
	
		var loadCallbackFunc = function()
		{
			self.pendingRequest = null;
			self.dataWasLoaded = true;
	
			self.applyColumnTypes();
	
			self.disableNotifications();
			self.filterAndSortData();
			self.enableNotifications();
	
			self.trigger("onPostLoad");
			self.trigger("onDataChanged");
		};
	
		if (syncLoad)
			loadCallbackFunc();
		else
			this.pendingRequest.timer = setTimeout(loadCallbackFunc, 0);
	},


	filterAndSortData: function()
	{
		// If there is a data filter installed, run it.
	
		if (this.filterDataFunc)
			this.filterData(this.filterDataFunc, true);
	
		// If the distinct flag was set, run through all the records in the recordset
		// and toss out any that are duplicates.
	
		if (this.distinctOnLoad)
			this.distinct(this.distinctFieldsOnLoad);
	
		// If sortOnLoad was set, sort the data based on the columns
		// specified in sortOnLoad.
	
		if (this.keepSorted && this.getSortColumn())
			this.sort(this.lastSortColumns, this.lastSortOrder);
		else if (this.sortOnLoad)
			this.sort(this.sortOnLoad, this.sortOrderOnLoad);
	
		// If there is a view filter installed, run it.
	
		if (this.filterFunc)
			this.filter(this.filterFunc, true);
	
		// The default "current" row is the first row of the data set.
		if (this.data && this.data.length > 0)
			this.curRowID = this.data[0]['ds_RowID'];
		else
			this.curRowID = 0;
	},

	cancelLoadData: function()
	{
		if (this.pendingRequest && this.pendingRequest.timer)
			clearTimeout(this.pendingRequest.timer);
		this.pendingRequest = null;
	},

	getRowCount: function(unfiltered)
	{
		var rows = this.getData(unfiltered);
		return rows ? rows.length : 0;
	},

	getRowByID: function(rowID)
	{
		if (!this.data)
			return null;
		return this.dataHash[rowID];
	},

	getRowByRowNumber: function(rowNumber, unfiltered)
	{
		var rows = this.getData(unfiltered);
		if (rows && rowNumber >= 0 && rowNumber < rows.length)
			return rows[rowNumber];
		return null;
	},

	getCurrentRow: function()
	{
		return this.getRowByID(this.curRowID);
	},

	setCurrentRow: function(rowID)
	{
		if (this.curRowID == rowID)
			return;
	
		var nData = { oldRowID: this.curRowID, newRowID: rowID };
		this.curRowID = rowID;
		this.trigger("onCurrentRowChanged", nData);
	},

	getRowNumber: function(row, unfiltered)
	{
		if (row)
		{
			var rows = this.getData(unfiltered);
			if (rows && rows.length)
			{
				var numRows = rows.length;
				for (var i = 0; i < numRows; i++)
				{
					if (rows[i] == row)
						return i;
				}
			}
		}
		return -1;
	},

	getCurrentRowNumber: function()
	{
		return this.getRowNumber(this.getCurrentRow());
	},

	getCurrentRowID: function()
	{
		return this.curRowID;
	},

	setCurrentRowNumber: function(rowNumber)
	{
		if (!this.data || rowNumber >= this.data.length)
		{
			try { console.log("Invalid row number: " + rowNumber + "\n"); } catch(e) {}
			return;
		}
	
		var rowID = this.data[rowNumber]["ds_RowID"];
	
		if (rowID == undefined || this.curRowID == rowID)
			return;
	
		this.setCurrentRow(rowID);
	},

	findRowsWithColumnValues: function(valueObj, firstMatchOnly, unfiltered)
	{
		var results = [];
		var rows = this.getData(unfiltered);
		if (rows)
		{
			var numRows = rows.length;
			for (var i = 0; i < numRows; i++)
			{
				var row = rows[i];
				var matched = true;
	
				for (var colName in valueObj)
				{
					if (valueObj[colName] != row[colName])
					{
						matched = false;
						break;
					}
				}
	
				if (matched)
				{
					if (firstMatchOnly)
						return row;
					results.push(row);
				}
			}
		}
	
		return firstMatchOnly ? null : results;
	},

	setColumnType: function(columnNames, columnType)
	{
		if (columnNames)
		{
			if (typeof columnNames == "string")
				columnNames = [ columnNames ];
			for (var i = 0; i < columnNames.length; i++)
				this.columnTypes[columnNames[i]] = columnType;
		}
	},

	getColumnType: function(columnName)
	{
		if (this.columnTypes[columnName])
			return this.columnTypes[columnName];
		return "string";
	},

	applyColumnTypes: function()
	{
		var rows = this.getData(true);
		var numRows = rows.length;
		var colNames = [];
	
		if (numRows < 1)
			return;
	
		for (var cname in this.columnTypes)
		{
			var ctype = this.columnTypes[cname];
			if (ctype != "string")
			{
				for (var i = 0; i < numRows; i++)
				{
					var row = rows[i];
					var val = row[cname];
					if (val != undefined)
					{
						if (ctype == "number")
							row[cname] = new Number(val);
						else if (ctype == "html")
							row[cname] = decodeEntities(val);
					}
				}
			}
		}
	},

	distinct: function(columnNames)
	{
		if (this.data)
		{
			var oldData = this.data;
			this.data = [];
			this.dataHash = {};
			var dataChanged = false;
	
			var alreadySeenHash = {};
			var i = 0;
	
			var keys = [];
	
			if (typeof columnNames == "string")
				keys = [columnNames];
			else if (columnNames)
				keys = columnNames;
			else
				for (var recField in oldData[0])
					keys[i++] = recField;
	
			for (var i = 0; i < oldData.length; i++)
			{
				var rec = oldData[i];
				var hashStr = "";
				for (var j=0; j < keys.length; j++)
				{
					recField = keys[j];
					if (recField != "ds_RowID")
					{
						if (hashStr)
							hashStr += ",";
						hashStr += recField + ":" + "\"" + rec[recField] + "\"";
					}
				}
				if (!alreadySeenHash[hashStr])
				{
					this.data.push(rec);
					this.dataHash[rec['ds_RowID']] = rec;
					alreadySeenHash[hashStr] = true;
				}
				else
					dataChanged = true;
			}
			if (dataChanged)
				this.trigger('onDataChanged');
		}
	},

	getSortColumn: function() {
		return (this.lastSortColumns && this.lastSortColumns.length > 0) ? this.lastSortColumns[0] : "";
	},

	getSortOrder: function() {
	return this.lastSortOrder ? this.lastSortOrder : "";
},

	sort: function(columnNames, sortOrder)
	{
		// columnNames can be either the name of a column to
		// sort on, or an array of column names, but it can't be
		// null/undefined.
	
		if (!columnNames)
			return;
	
		// If only one column name was specified for sorting, do a
		// secondary sort on ds_RowID so we get a stable sort order.
	
		if (typeof columnNames == "string")
			columnNames = [ columnNames, "ds_RowID" ];
		else if (columnNames.length < 2 && columnNames[0] != "ds_RowID")
			columnNames.push("ds_RowID");
	
		if (!sortOrder)
			sortOrder = "toggle";
	
		if (sortOrder == "toggle")
		{
			if (this.lastSortColumns.length > 0 && this.lastSortColumns[0] == columnNames[0] && this.lastSortOrder == "ascending")
				sortOrder = "descending";
			else
				sortOrder = "ascending";
		}
	
		if (sortOrder != "ascending" && sortOrder != "descending")
		{
			try { console.log("Invalid sort order type specified: " + sortOrder + "\n"); } catch(e) {}
			return;
		}
	
		var nData = {
			oldSortColumns: this.lastSortColumns,
			oldSortOrder: this.lastSortOrder,
			newSortColumns: columnNames,
			newSortOrder: sortOrder
		};
		this.trigger("onPreSort", nData);
	
		var cname = columnNames[columnNames.length - 1];
		var sortfunc = 	this.getSortFunc(cname, this.getColumnType(cname), sortOrder);
	
		for (var i = columnNames.length - 2; i >= 0; i--)
		{
			cname = columnNames[i];
			sortfunc = 	this.buildSecondarySortFunc(	this.getSortFunc(cname, this.getColumnType(cname), sortOrder), sortfunc);
		}
	
		if (this.unfilteredData)
		{
			this.unfilteredData.sort(sortfunc);
			if (this.filterFunc)
				this.filter(this.filterFunc, true);
		}
		else
			this.data.sort(sortfunc);
	
		this.lastSortColumns = columnNames.slice(0); // Copy the array.
		this.lastSortOrder = sortOrder;
	
		this.trigger("onPostSort", nData);
	},

	getSortFunc: function(prop, type, order)
	{
		var sortfunc = null;
		if (type == "number")
		{
			if (order == "ascending")
				sortfunc = function(a, b)
				{
					a = a[prop]; b = b[prop];
					if (a == undefined || b == undefined)
						return (a == b) ? 0 : (a ? 1 : -1);
					return a-b;
				};
			else // order == "descending"
				sortfunc = function(a, b)
				{
					a = a[prop]; b = b[prop];
					if (a == undefined || b == undefined)
						return (a == b) ? 0 : (a ? -1 : 1);
					return b-a;
				};
		}
		else if (type == "date")
		{
			if (order == "ascending")
				sortfunc = function(a, b)
				{
					var dA = a[prop];
					var dB = b[prop];
					dA = dA ? (new Date(dA)) : 0;
					dB = dB ? (new Date(dB)) : 0;
					return dA - dB;
				};
			else // order == "descending"
				sortfunc = function(a, b)
				{
					var dA = a[prop];
					var dB = b[prop];
					dA = dA ? (new Date(dA)) : 0;
					dB = dB ? (new Date(dB)) : 0;
					return dB - dA;
				};
		}
		else // type == "string" || type == "html"
		{
			if (order == "ascending")
				sortfunc = function(a, b){
					a = a[prop];
					b = b[prop];
					if (a == undefined || b == undefined)
						return (a == b) ? 0 : (a ? 1 : -1);
					var tA = a.toString();
					var tB = b.toString();
					var tA_l = tA.toLowerCase();
					var tB_l = tB.toLowerCase();
					var min_len = tA.length > tB.length ? tB.length : tA.length;
	
					for (var i=0; i < min_len; i++)
					{
						var a_l_c = tA_l.charAt(i);
						var b_l_c = tB_l.charAt(i);
						var a_c = tA.charAt(i);
						var b_c = tB.charAt(i);
						if (a_l_c > b_l_c)
							return 1;
						else if (a_l_c < b_l_c)
							return -1;
						else if (a_c > b_c)
							return 1;
						else if (a_c < b_c)
							return -1;
					}
					if(tA.length == tB.length)
						return 0;
					else if (tA.length > tB.length)
						return 1;
					return -1;
				};
			else // order == "descending"
				sortfunc = function(a, b){
					a = a[prop];
					b = b[prop];
					if (a == undefined || b == undefined)
						return (a == b) ? 0 : (a ? -1 : 1);
					var tA = a.toString();
					var tB = b.toString();
					var tA_l = tA.toLowerCase();
					var tB_l = tB.toLowerCase();
					var min_len = tA.length > tB.length ? tB.length : tA.length;
					for (var i=0; i < min_len; i++)
					{
						var a_l_c = tA_l.charAt(i);
						var b_l_c = tB_l.charAt(i);
						var a_c = tA.charAt(i);
						var b_c = tB.charAt(i);
						if (a_l_c > b_l_c)
							return -1;
						else if (a_l_c < b_l_c)
							return 1;
						else if (a_c > b_c)
							return -1;
						else if (a_c < b_c)
							return 1;
					}
					if(tA.length == tB.length)
						return 0;
					else if (tA.length > tB.length)
						return -1;
					return 1;
				};
		}
	
		return sortfunc;
	},

	buildSecondarySortFunc: function(funcA, funcB)
	{
		return function(a, b)
		{
			var ret = funcA(a, b);
			if (ret == 0)
				ret = funcB(a, b);
			return ret;
		};
	},

	filterData: function(filterFunc, filterOnly)
	{
		// This is a destructive filter function.
	
		var dataChanged = false;
	
		if (!filterFunc)
		{
			// Caller wants to remove the filter.
	
			this.filterDataFunc = null;
			dataChanged = true;
		}
		else
		{
			this.filterDataFunc = filterFunc;
	
			if (this.dataWasLoaded && ((this.unfilteredData && this.unfilteredData.length) || (this.data && this.data.length)))
			{
				if (this.unfilteredData)
				{
					this.data = this.unfilteredData;
					this.unfilteredData = null;
				}
	
				var oldData = this.data;
				this.data = [];
				this.dataHash = {};
	
				for (var i = 0; i < oldData.length; i++)
				{
					var newRow = filterFunc(this, oldData[i], i);
					if (newRow)
					{
						this.data.push(newRow);
						this.dataHash[newRow["ds_RowID"]] = newRow;
					}
				}
	
				dataChanged = true;
			}
		}
	
		if (dataChanged)
		{
			if (!filterOnly)
			{
				this.disableNotifications();
				if (this.filterFunc)
					this.filter(this.filterFunc, true);
				this.enableNotifications();
			}
	
			this.trigger("onDataChanged");
		}
	},

	filter: function(filterFunc, filterOnly)
	{
		// This is a non-destructive filter function.
	
		var dataChanged = false;
	
		if (!filterFunc)
		{
			if (this.filterFunc && this.unfilteredData)
			{
				// Caller wants to remove the filter. Restore the unfiltered
				// data and trigger a data changed notification.
	
				this.data = this.unfilteredData;
				this.unfilteredData = null;
				this.filterFunc = null;
				dataChanged = true;
			}
		}
		else
		{
			this.filterFunc = filterFunc;
	
			if (this.dataWasLoaded && (this.unfilteredData || (this.data && this.data.length)))
			{
				if (!this.unfilteredData)
					this.unfilteredData = this.data;
	
				var udata = this.unfilteredData;
				this.data = [];
	
				for (var i = 0; i < udata.length; i++)
				{
					var newRow = filterFunc(this, udata[i], i);
	
					if (newRow)
						this.data.push(newRow);
				}
	
				dataChanged = true;
			}
		}
	
		if (dataChanged)
			this.trigger("onDataChanged");
	},

	startLoadInterval: function(interval)
	{
		this.stopLoadInterval();
		if (interval > 0)
		{
			var self = this;
			this.loadInterval = interval;
			this.loadIntervalID = setInterval(function() { self.loadData(); }, interval);
		}
	},

	stopLoadInterval: function()
	{
		if (this.loadIntervalID)
			clearInterval(this.loadIntervalID);
		this.loadInterval = 0;
		this.loadIntervalID = null;
	},
});

$.data.dataset = DataSet;

////////// Utilities //////////

function escapeQuotesAndLineBreaks(str)
{
	if (str)
	{
		str = str.replace(/\\/g, "\\\\");
		str = str.replace(/["']/g, "\\$&");
		str = str.replace(/\n/g, "\\n");
		str = str.replace(/\r/g, "\\r");
	}
	return str;
}

function encodeEntities(str)
{
	if (str && str.search(/[&<>"]/) != -1)
	{
		str = str.replace(/&/g, "&amp;");
		str = str.replace(/</g, "&lt;");
		str = str.replace(/>/g, "&gt;");
		str = str.replace(/"/g, "&quot;");
	}
	return str
}

function decodeEntities(str)
{
	var d = decodeEntities.div;
	if (!d)
	{
		d = document.createElement('div');
		decodeEntities.div = d;
		if (!d) return str;
	}
	d.innerHTML = str;
	if (d.childNodes.length == 1 && d.firstChild.nodeType == 3 /* Node.TEXT_NODE */ && d.firstChild.nextSibling == null)
		str = d.firstChild.data;
	else
	{
		// Hmmm, innerHTML processing of str produced content
		// we weren't expecting, so just replace entities we
		// expect folks will use in node attributes that contain
		// JavaScript.
		str = str.replace(/&lt;/gi, "<");
		str = str.replace(/&gt;/gi, ">");
		str = str.replace(/&quot;/gi, "\"");
		str = str.replace(/&amp;/gi, "&");
	}
	return str;
}

//////////////////////////
})(jQuery,window,document);