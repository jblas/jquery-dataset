/*
* jQuery Data Set Framework : dataset plugin
* Copyright (c) 2010 Adobe Systems Incorporated - Kin Blas (jblas@adobe.com)
* Dual licensed under the MIT (MIT-LICENSE.txt) and GPL (GPL-LICENSE.txt) licenses.
* Note: Code is in draft form and is subject to change 
*/

(function($,window,document,undefined){

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

function DataSet(opts)
{
	Notifier.call(this);
	this.data = [];
}

$.extend(DataSet.prototype, Notifier.prototype, {
/*
    * findRowsWithColumnValues
    * getColumnType
    * getDataWasLoaded
    * getLoadDataRequestIsPending
    * getSortColumn
    * getSortOrder
    * setColumnType
    * setDataFromArray
    * startLoadInterval
    * stopLoadInterval
*/

	getData: function(unfiltered)
	{
	},

	getRowCount: function(unfiltered)
	{
	},

	getRowNumber: function()
	{
	},

	loadData: function()
	{
	},
	
	cancelLoadData: function()
	{
	},

	distinct: function()
	{
	},

	sort: function()
	{
	},

	filter: function()
	{
	},

	filterData: function()
	{
	},

	getRowByID: function()
	{
	},

	getRowByRowNumber: function()
	{
	},

	getCurrentRow: function()
	{
	},

	setCurrentRow: function()
	{
	},

	getCurrentRowID: function()
	{
	},

	setCurrentRowID: function()
	{
	},

	getCurrentRowNumber: function()
	{
	},

	setCurrentRowNumber: function()
	{
	},

	bind: function(func)
	{
	},

	unbind: function(func)
	{
	}
});

$.data.dataset = DataSet;

})(jQuery,window,document);