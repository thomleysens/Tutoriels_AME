importScripts("https://cdn.jsdelivr.net/pyodide/v0.24.1/pyc/pyodide.js");

function sendPatch(patch, buffers, msg_id) {
  self.postMessage({
    type: 'patch',
    patch: patch,
    buffers: buffers
  })
}

async function startApplication() {
  console.log("Loading pyodide!");
  self.postMessage({type: 'status', msg: 'Loading pyodide'})
  self.pyodide = await loadPyodide();
  self.pyodide.globals.set("sendPatch", sendPatch);
  console.log("Loaded!");
  await self.pyodide.loadPackage("micropip");
  const env_spec = ['https://cdn.holoviz.org/panel/wheels/bokeh-3.3.1-py3-none-any.whl', 'https://cdn.holoviz.org/panel/1.3.1/dist/wheels/panel-1.3.1-py3-none-any.whl', 'pyodide-http==0.2.1', 'geopandas', 'numpy', 'requests', 'shapely', 'xyzservices', 'yaml']
  for (const pkg of env_spec) {
    let pkg_name;
    if (pkg.endsWith('.whl')) {
      pkg_name = pkg.split('/').slice(-1)[0].split('-')[0]
    } else {
      pkg_name = pkg
    }
    self.postMessage({type: 'status', msg: `Installing ${pkg_name}`})
    try {
      await self.pyodide.runPythonAsync(`
        import micropip
        await micropip.install('${pkg}');
      `);
    } catch(e) {
      console.log(e)
      self.postMessage({
	type: 'status',
	msg: `Error while installing ${pkg_name}`
      });
    }
  }
  console.log("Packages loaded!");
  self.postMessage({type: 'status', msg: 'Executing code'})
  const code = `
  
import asyncio

from panel.io.pyodide import init_doc, write_doc

init_doc()

#!/usr/bin/env python
# coding: utf-8

# # DOCTORIALES GAME (*PANEL APP*)

# In[ ]:


import geopandas as gpd
import panel as pn
import numpy as np
import time
import xyzservices.providers as xyz
import yaml
import requests
from collections import namedtuple
from random import sample
from bokeh.palettes import Greens5 as palette
from bokeh.models import (
    ColumnDataSource,
    PointDrawTool, 
    Button,
    HoverTool,
    Range1d
)
from bokeh.plotting import figure
from shapely.geometry import Point


#SET PANEL EXTENSION
pn.extension(notifications=True)
# pn.state.notifications.position = "center-center"

palette = list(reversed(palette))

#SET DEFAULT CHAT PARAMETERS
pn.chat.ChatMessage.default_avatars["Bot"] = "🤖"
pn.chat.ChatMessage.show_reaction_icons = False

#Function here and not in a separated module because of Pyodide 
#conversion restrictions ("The only requirement is that they 
#import only global modules and packages (relative imports 
#of other scripts or modules is not supported)" (Source:
#https://panel.holoviz.org/how_to/wasm/convert.html)
def load_params(filepath):
    """
    Load parameters from local or remote
    YAML file

    Parameters
    ----------
    filepath (str): URL or path to local file
                    File (local or remote) needs 
                    to be structured like this:
                    ranges:
                        x: [-284221, -277648]
                        y: [5987515, 5992714]
                    buffer_value: 200
                    csv:
                        file: "game_QA.csv"
                        sep: ";" 
                    nb_questions: 5
    Return
    ------
    params (namedtuple)
    """
    Params = namedtuple(
        "Params",
        [
            "ranges",
            "buffer_value",
            "nb_q",
            "csv_sep",
            "csv_file"
        ]
    )
    #Cheap way to check if url
    #(better methods exist but we want to 
    #keep it simple)
    if filepath.lower().startswith(
        ("http://", "https://")
    ):
        content = yaml.safe_load(
            requests.get(filepath).content
        )
    else:
        with open(filepath, "r") as file:
            content = yaml.load(
                file,
                Loader=yaml.FullLoader,
            )

    params = Params(
        content["ranges"],
        content["buffer_value"],
        content["nb_questions"],
        content["csv"]["sep"],
        content["csv"]["file"]
    )

    return params

#READ & lOAD YAML PARAMETERS
filepath = "https://raw.githubusercontent.com/thomleysens/Tutoriels_AME/main/tutoriels/game_params_remote.yml" #remote
PARAMS = load_params(filepath)

class Game:
    """
    Create game:
        - elements
        - interface
        - functions
    """
    def __init__(self):
        """
        Init figures and widgets:
            - map
            - chat feed
            - histogram
            - main board
        & load DataFrame from CSV file
        & transform it to GeoDataFrame
        """
        self.rules = pn.pane.Alert(
            "<p>Click on the START button \
            to start a game.</p><p>Place a point on the map \
            (<i>with Point Draw Tool</i> \
            <img src='https://docs.bokeh.org/en/latest/_images/PointDraw.png' \
            alt='Point draw tool' style='width:20px;height:20px'>) \
            to answer a question (<i>out of a total of {}</i>)</p><p>Then click \
            on the VALIDATE button.</p><p>You can also pan \
            <img src='https://docs.bokeh.org/en/latest/_images/Pan.png' \
            alt='Pan tool' style='width:20px;height:20px'> \
            and wheel zoom \
            <img src='https://docs.bokeh.org/en/latest/_images/WheelZoom.png' \
            alt='Wheel zoom tool' style='width:20px;height:20px'></p>".format(PARAMS.nb_q),
            alert_type="primary"
        )
        self.issues = pn.pane.Alert(
            "A tutorial on how this game has been developped is available \
            <a href='https://thomleysens.github.io/Tutoriels_AME/game_panel_tutorial.html' \
            target='_blank'>here</a> \
            If you find bugs or want to propose new features, \
            feel free to create a \
            <a href='https://github.com/thomleysens/Tutoriels_AME/issues' \
            target='_blank'>new issue on GitHub</a>",
            alert_type="warning"
        )
        self.progress_value = int(100/PARAMS.nb_q)
        self.chat_feed = pn.chat.ChatFeed()
        self.map = figure(
            name="map",
            sizing_mode="stretch_both",
            # min_height=600
        )
        self.map.add_tile(xyz.OpenStreetMap.Mapnik)
        self.map.axis.visible = False
        self.map.grid.visible = False
        self.map.x_range = Range1d(
            PARAMS.ranges["x"][0],
            PARAMS.ranges["x"][1]
        )
        self.map.y_range = Range1d(
            PARAMS.ranges["y"][0],
            PARAMS.ranges["y"][1]
        )
        df = gpd.pd.read_csv(
            PARAMS.csv_file,
            sep=PARAMS.csv_sep,
            encoding="utf-8"
        )
        df["geometry"] = df.apply(
            lambda x: Point(x.x, x.y),
            axis=1
        )
        self.gdf_base = gpd.GeoDataFrame(df).set_crs(
            epsg=4326
        ).to_crs(
            epsg=3857
        )
        self.gdf = self.gdf_base.copy()
        self._set()
        self._get_random()
        self.progress = pn.indicators.Dial(
            name="Completion", 
            value=0, 
            bounds=(0, 100), 
            format="{value} %",
            colors=[
                (0.25, palette[1]), 
                (0.50, palette[2]), 
                (0.75, palette[3]),
                (1.0, palette[4])
            ],
            title_size="18px",
            value_size="20px"
        )
        self.points = self.map.scatter(
            x="x", 
            y="y", 
            source=self.source, 
            size=10,
            color="red"
        )
        self.points.on_change(
            "data_source", 
            self._get_point
        )
        draw_tool = PointDrawTool(
            renderers=[self.points], 
            empty_value="black"
        )
        self.map.add_tools(draw_tool)
        self.map.toolbar.active_tap = draw_tool
        self.run_button = Button(
            label="START", 
            button_type="success"
        )
        self.reset_button = Button(
            label="RESET", 
            button_type="warning"
        )
        self.check_button = Button(
            label="VALIDATE", 
            button_type="success"
        )
        self.run_button.on_click(
            self._get_question
        )
        self.check_button.on_click(
            self._check
        )
        self.reset_button.on_click(
            self._reset
        )
        self.loading = pn.indicators.LoadingSpinner(
            value=True, 
            size=60, 
            name="spinner", 
            visible=False
        )
        tooltips = [
            ("question", "@question"),
            ("time", "@time")
        ]
        self.hist = figure(
            x_axis_label="Question",
            y_axis_label="Time in seconds",
            title="Time by question",
            toolbar_location=None, 
            tools="",
            x_range=[
                str(x+1) for x in range(PARAMS.nb_q)
            ],
            sizing_mode="stretch_both",
            tooltips=tooltips
        )
        self.hist.vbar(
            x="question",
            top="time",
            width=0.5,
            bottom=0.0,
            source=self.hist_source
        )
        self.main_board = pn.Row(
            self.map,
            self.chat_feed,
            sizing_mode="stretch_both",
            # min_height=1000 #May change for mobile
        )
        
        
    def _set(self, reset=False):
        """
        Set or reset some variables:
            - set when initial load
            - reset when new game

        Parameters
        ----------
        reset (bool): if True, reset ColumnDataSource data,
                      else set ColumnDataSource
                      Default: False
        """
        self.question_time = {
            "question":[],
            "time":[]
        }
        source = {
                "x": [], 
                "y": [] 
        }
        hist_source = {
            "question":[],
            "time":[]
        }
        if reset is True:
            self.source.data = source
            self.hist_source.data = hist_source
        else:
            self.source = ColumnDataSource(source)
            self.hist_source = ColumnDataSource(hist_source)
        self.index = 0
    
    
    def _get_question(self, event):
        """
        Choose a question from the GeoDataFrame
        random selection.
        Check if PARAMS.nb_q has been reached:
            - if true => show total time and
            histogram with time/question
            - if false => get and show next
            question
        """
        if self.index == PARAMS.nb_q:
            self.chat_feed.send(
                {
                    "object":"Game over. Click on \
                    the RESET button to start a new game.\
                    <b>Total time: {}</b>".format(
                        time.strftime(
                            "%Hh%Mm%Ss", 
                            time.gmtime(
                                sum(self.question_time["time"])
                            )
                        )
                    ),
                    "user":"Bot"
                },
                respond=False
            )
            time.sleep(0.5)
            self.chat_feed.send(
                {
                    "object":self.hist,
                    "user":"Bot"
                },
                respond=False
            )
            self.check_button.disabled
        else:
            self.question_time_start = time.time()
            self.selection = self.game_set.iloc[
                self.index
            ]
            self.chat_feed.send(
                {
                    "object":"Question {}/{}: {}".format(
                        self.index+1,
                        PARAMS.nb_q,
                        self.selection.question
                    ),
                    "user":"Bot"
                },
                respond=False
            ) 
            self.index += 1
            self.run_button.disabled = True
        

    def _get_random(self):
        """
        Get a random sample from GeoDataFrame
        indexes:
            - get selection indexes
            - set self.game_set
        """
        self.game_set = self.gdf.copy().iloc[
            sample(
                list(self.gdf.index), 
                k=PARAMS.nb_q
            )
        ]
        self.indexes = list(
            set(
                self.game_set.index.values
            )
        )
        self.game_set.reset_index(
            drop=True,
            inplace=True
        )
        
    
    def _get_point(self, attr, old, new):
        """
        Get the point added by user via
        the Point Draw Tool
        """
        self.answer_point = (
            self.source.data["x"].values[0],
            self.source.data["y"].values[0]
        )
    
    
    def _reset(self, event):
        """
        - Reset self.run_button
        - Clear self.chat_feed
        - Set self.progress.value to 0
        - Run self._set with reset=True
        """
        self.run_button.disabled = False
        self.chat_feed.clear()
        self.progress.value = 0
        self._set(reset=True)
        self.gdf = self.gdf.drop(
            index=self.indexes
        ).reset_index(
            drop=True
        )
        if self.gdf.empty is True:
            self.chat_feed.send(
                {
                    "object":"No more questions \
                    available. I will reset all. \
                    You will get same questions",
                    "user":"Bot"
                },
                respond=False
            )
            self.gdf = self.gdf_base.copy()
        else:
            self._get_random()

    
    def _check(self, event):
        """
        Check the answer:
            - get last point added & buffer it
            - check if buffer contains correct
            answer point:
                - if True => send message to chat
                with answer and wiki URL
                - if False => send hint to chat
            
        """
        self.main_board.loading = True
        gdf = gpd.GeoDataFrame(
            self.source.data
        )
        if gdf.empty is True:
            self.main_board.loading = False
            self.chat_feed.send(
                {
                    "object":"Please place a point",
                    "user":"Bot"
                },
                respond=False
            )
        else:
            gdf["geometry"] = gdf.apply(
                lambda x: Point(x.x, x.y),
                axis=1
            )
            gdf = gpd.GeoDataFrame(
                gdf
            ).set_geometry(
                "geometry"
            ).set_crs(
                epsg=3857
            )
            buffer = gdf.geometry.values[-1].buffer(
                PARAMS.buffer_value
            )
            if buffer.contains(
                self.selection.geometry
            ) is True:
                self.progress.value += self.progress_value
                self.question_time["question"].append(str(self.index))
                time_question = round(
                    time.time()-self.question_time_start
                )
                self.question_time["time"].append(
                    time_question
                )
                self.hist_source.data = self.question_time
                self.main_board.loading = False
                self.run_button.disabled = False
                time.sleep(1)
                if gpd.pd.isna(self.selection.url):
                    chat_object = "Great !\
                        You have found {}\
                        in {} seconds".format(
                            self.selection.answer,
                            time_question
                        )
                else:
                    chat_object = "Great !\
                        You have found <a href='{}' target='_blank'>{}</a>\
                        in {} seconds".format(
                            self.selection.url,
                            self.selection.answer,
                            time_question
                        )
                self.chat_feed.send(
                    {
                        "object":chat_object,
                        "user":"Bot"
                    },
                    respond=False
                )
                time.sleep(0.5) 
                self._get_question("click")
            else:
                self.main_board.loading = False
                self.chat_feed.send(
                    {
                        "object":"Nope ! Here's a hint: {}".format(
                            self.selection.hint
                        ),
                        "user":"Bot"
                    },
                    respond=False
                )
        
# Init Game
game = Game()
# Template
bootstrap = pn.template.BootstrapTemplate(
    title="Doctoriales GAME",
    # theme=pn.template.theme.DarkTheme,
)
bootstrap.sidebar_width = 270
bootstrap.sidebar.append(
    pn.Row(
        game.run_button,
        game.check_button,
        game.reset_button
    )
)
bootstrap.sidebar.append(game.rules)
bootstrap.sidebar.append(game.progress)
bootstrap.sidebar.append(game.issues)
bootstrap.main.append(game.main_board)
bootstrap.servable();



await write_doc()
  `

  try {
    const [docs_json, render_items, root_ids] = await self.pyodide.runPythonAsync(code)
    self.postMessage({
      type: 'render',
      docs_json: docs_json,
      render_items: render_items,
      root_ids: root_ids
    })
  } catch(e) {
    const traceback = `${e}`
    const tblines = traceback.split('\n')
    self.postMessage({
      type: 'status',
      msg: tblines[tblines.length-2]
    });
    throw e
  }
}

self.onmessage = async (event) => {
  const msg = event.data
  if (msg.type === 'rendered') {
    self.pyodide.runPythonAsync(`
    from panel.io.state import state
    from panel.io.pyodide import _link_docs_worker

    _link_docs_worker(state.curdoc, sendPatch, setter='js')
    `)
  } else if (msg.type === 'patch') {
    self.pyodide.globals.set('patch', msg.patch)
    self.pyodide.runPythonAsync(`
    state.curdoc.apply_json_patch(patch.to_py(), setter='js')
    `)
    self.postMessage({type: 'idle'})
  } else if (msg.type === 'location') {
    self.pyodide.globals.set('location', msg.location)
    self.pyodide.runPythonAsync(`
    import json
    from panel.io.state import state
    from panel.util import edit_readonly
    if state.location:
        loc_data = json.loads(location)
        with edit_readonly(state.location):
            state.location.param.update({
                k: v for k, v in loc_data.items() if k in state.location.param
            })
    `)
  }
}

startApplication()